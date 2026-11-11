// Generates /database.rules.json from readable macros.
//   node tools/build-rules.mjs          -> write database.rules.json
//   node tools/build-rules.mjs --check  -> exit 1 if the file is out of date
//
// Data layout (see SPEC.md "Data model"):
//   /secrets/{code}/pin                      host PIN, never readable by any client
//   /rooms/{code}/hostUids/{uid}             true for hosts
//   /rooms/{code}/hostClaims/{uid}           PIN guess written by a device that wants to become host
//   /rooms/{code}/claimTries/{uid}           guess counter, max 8 per uid
//   /rooms/{code}/public                     everyone reads, hosts write (phase, question, timer, settings, ...)
//   /rooms/{code}/private                    hosts only (author mapping, AI import, host script, scores)
//   /rooms/{code}/players|presence|reps      roster, online flags, tổ representatives
//   /rooms/{code}/answers/{round}/{uid}      author + hosts read
//   /rooms/{code}/submitted/{round}/{uid}    public "has submitted" flags
//   /rooms/{code}/votes/{round}/{uid}        optionIndex
//   /rooms/{code}/banned/{uid}               kicked uids
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SETTING_SPECS } from '../js/lib/settings.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'database.rules.json');

// root.child('rooms/'+$code+'/<p>') with {uid}/{round}/{xuid}/{team} placeholders
const room = (p) =>
  `root.child('rooms/'+$code+'/${p}')`
    .replace(/\{uid\}/g, "'+auth.uid+'")
    .replace(/\{xuid\}/g, "'+$uid+'")
    .replace(/\{round\}/g, "'+$roundId+'")
    .replace(/\{team\}/g, "'+$team+'")
    .replace(/\+''\)/g, ')');
const pub = (p) => room(`public/${p}`);

const AUTH = 'auth != null';
const HOST = `${room('hostUids/{uid}')}.val() === true`;
// Host for writes: an existing host, or the creator in the SAME multi-path update that creates the room.
// (RTDB rules have no newRoot: newData.parent() is the post-write snapshot of rooms/$code, valid at rooms/$code/<child>.)
const HOSTW = `(${HOST} || (!${room('hostUids')}.exists() && newData.parent().child('hostUids').child(auth.uid).val() === true))`;
const NOTBAN = `!${room('banned/{uid}')}.exists()`;
const JOINED = `${room('players/{uid}')}.exists()`;
const ROUND_OK = `$roundId === ${pub('roundId')}.val()`;
const phaseIs = (p) => `${pub('phase')}.val() === '${p}'`;
const TIMER_OPEN =
  `((${pub('timer/state')}.val() === 'running' && now <= ${pub('timer/endsAt')}.val() + ${pub('settings/graceMs')}.val()) || ${pub('timer/state')}.val() === 'paused')`;
const MY_TEAM = room('players/{uid}/team');
const REP_OK =
  `(${pub('settings/mode')}.val() !== 'team' || root.child('rooms/'+$code+'/reps/'+${MY_TEAM}.val()).val() === auth.uid)`;
const TRIES = room('claimTries/{uid}');
const CODE_RE = '/^[A-HJKMNP-Z2-9]{6}$/';

// ---- stage 2: validators generated from the shared setting specs (js/lib/settings.js) ----
const specRule = (spec) => {
  if (spec.type === 'bool') return 'newData.isBoolean()';
  if (spec.type === 'enum') return `newData.isString() && (${spec.values.map((v) => `newData.val() === '${v}'`).join(' || ')})`;
  if (spec.values) return `newData.isNumber() && (${spec.values.map((v) => `newData.val() === ${v}`).join(' || ')})`;
  return `newData.isNumber() && newData.val() >= ${spec.min} && newData.val() <= ${spec.max}`;
};
const settingsRules = {
  ...Object.fromEntries(Object.entries(SETTING_SPECS).map(([k, spec]) => [k, { '.validate': specRule(spec) }])),
  teams: { $team: { '.validate': '$team.matches(/^t[1-6]$/)', name: { '.validate': 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 20' }, $other: { '.validate': false } } },
  badWords: { $i: { '.validate': 'newData.isString() && newData.val().length >= 2 && newData.val().length <= 30' } },
};
const str = (max, min = 0) => `newData.isString() && newData.val().length >= ${min} && newData.val().length <= ${max}`;
const num = (min, max) => `newData.isNumber() && newData.val() >= ${min} && newData.val() <= ${max}`;
const TEAM_RE = '/^t[1-6]$/';
const IDX = '/^[0-9]{1,2}$/';


export const rules = {
  rules: {
    '.read': false,
    '.write': false,

    secrets: {
      $code: {
        '.validate': `$code.matches(${CODE_RE})`,
        // hosts may delete the secret when the room is ended
        '.write': `${AUTH} && ${HOST} && !newData.exists()`,
        pin: {
          // never readable. Writable by the room creator (same update that creates hostUids) or an existing host.
          '.write':
            `${AUTH} && (${HOST} || (!data.exists() && !${room('hostUids')}.exists() && newData.parent().parent().parent().child('rooms').child($code).child('hostUids').child(auth.uid).val() === true))`,
          '.validate': 'newData.isString() && newData.val().matches(/^[0-9]{6}$/)',
        },
      },
    },

    rooms: {
      $code: {
        '.validate': `$code.matches(${CODE_RE})`,
        // only a host can delete the whole room
        '.write': `${AUTH} && ${HOST} && !newData.exists()`,

        hostUids: {
          $uid: {
            '.read': `${AUTH} && ($uid === auth.uid || ${HOST})`,
            '.write':
              `${AUTH} && ((${HOST} && !newData.exists()) || ($uid === auth.uid && newData.val() === true && ${NOTBAN} && (` +
              // (a) claim with the right PIN: the claim can only exist if the rules accepted it AND it equals the secret
              `(${room('hostClaims/{uid}')}.exists() && ${room('hostClaims/{uid}')}.val() === root.child('secrets/'+$code+'/pin').val()) || ` +
              // (b) creator of a brand-new room, in the same update that sets the secret
              `(!${room('hostUids')}.exists() && newData.parent().parent().parent().parent().child('secrets').child($code).child('pin').exists())` +
              ')))',
            '.validate': 'newData.val() === true',
          },
        },

        hostClaims: {
          // The PIN guess. No client can read it back. Each guess must bump claimTries by exactly 1 (max 8 per uid).
          $uid: {
            '.write':
              `${AUTH} && $uid === auth.uid && ${NOTBAN} && ` +
              `newData.parent().parent().child('claimTries').child(auth.uid).val() === (${TRIES}.exists() ? ${TRIES}.val() : 0) + 1`,
            '.validate': 'newData.isString() && newData.val().matches(/^[0-9]{6}$/)',
          },
        },
        claimTries: {
          $uid: {
            '.read': `${AUTH} && $uid === auth.uid`,
            '.write': `${AUTH} && $uid === auth.uid && newData.isNumber() && newData.val() <= 8 && newData.val() === (data.exists() ? data.val() : 0) + 1`,
          },
        },

        public: {
          '.read': AUTH,
          '.write': `${AUTH} && ${HOSTW}`,
          phase: {
            '.validate': "newData.isString() && newData.val().matches(/^(lobby|answering|locked|reviewing|showcase|voting|scoring|reveal|leaderboard)$/)",
          },
          settings: settingsRules,
          question: { title: { '.validate': str(80) }, text: { '.validate': str(2000) } },
          // what the TV and the phones may see of the chosen answers: text + highlight, never a name
          showcase: {
            roundId: { '.validate': 'newData.isString()' },
            items: { $i: { '.validate': `$i.matches(${IDX}) && newData.hasChildren(['text'])`, text: { '.validate': str(2000, 1) }, hl: { '.validate': str(300) }, $other: { '.validate': false } } },
            focus: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() < 12' },
            $other: { '.validate': false },
          },
          vote: {
            open: { '.validate': 'newData.isBoolean()' },
            count: { '.validate': num(0, 12) },
            live: { '.validate': 'newData.isBoolean()' },
            skipped: { '.validate': 'newData.isBoolean()' },
            n: { '.validate': num(0, 1000) },
            tally: { $i: { '.validate': `$i.matches(${IDX}) && ${num(0, 100000)}` } },
            $other: { '.validate': false },
          },
          // names and tổ unlock only here, written by the Host at "Công bố người thắng"
          reveal: {
            roundId: { '.validate': 'newData.isString()' },
            top: { '.validate': 'newData.val() === 1 || newData.val() === 3' },
            items: {
              $i: {
                '.validate': `$i.matches(${IDX}) && newData.hasChildren(['n', 'team', 'rank'])`,
                n: { '.validate': num(0, 11) }, uid: { '.validate': str(64) }, team: { '.validate': `newData.isString() && newData.val().matches(${TEAM_RE})` }, name: { '.validate': str(40) },
                hostScore: { '.validate': num(0, 1000) }, votes: { '.validate': num(0, 100000) }, value: { '.validate': num(0, 100000) },
                rank: { '.validate': num(1, 12) }, honoured: { '.validate': 'newData.isBoolean()' }, points: { '.validate': num(0, 100000) },
                $other: { '.validate': false },
              },
            },
            $other: { '.validate': false },
          },
          // cumulative points, derived from private/awards + private/adjust by the Host
          board: {
            t: { $team: { '.validate': `$team.matches(${TEAM_RE}) && ${num(-100000, 100000)}` } },
            p: { $uid: { '.validate': num(-100000, 100000) } },
            $other: { '.validate': false },
          },
        },

        private: {
          '.read': `${AUTH} && ${HOST}`,
          '.write': `${AUTH} && ${HOSTW}`,
          // question bank kept in the room (also copied to the host's localStorage)
          bank: { $i: { '.validate': `$i.matches(${IDX}) && newData.hasChildren(['id', 'title', 'text', 'time'])`, id: { '.validate': str(24, 1) }, title: { '.validate': str(80, 1) }, text: { '.validate': str(2000, 1) }, time: { '.validate': num(10, 3600) } } },
          // per-answer review: st = chosen | rejected, hl = TV highlight, ai = suggested score, score = host score, edit = display text
          review: { $round: { $uid: {
            st: { '.validate': "newData.val() === 'chosen' || newData.val() === 'rejected'" },
            hl: { '.validate': str(300) }, reason: { '.validate': str(600) }, edit: { '.validate': str(2000) },
            ai: { '.validate': num(0, 1000) }, score: { '.validate': num(0, 1000) },
            $other: { '.validate': false },
          } } },
          order: { $round: { $i: { '.validate': `$i.matches(${IDX}) && newData.isString()` } } },
          aid: { $round: { $uid: { '.validate': 'newData.isString() && newData.val().matches(/^P[0-9]{2,3}$/)' } } },
          ai: { $round: { raw: { '.validate': str(60000) }, $other: { '.validate': true } } },
          // author mapping read by the voting rule: option index per author (and per tổ-mate in team mode)
          optionOf: { $round: { $uid: { '.validate': num(0, 11) } } },
          hand: { $round: { $i: { '.validate': `$i.matches(${IDX}) && ${num(0, 999)}` } } },
          awards: { $round: { '.validate': "newData.hasChildren(['at', 'items'])", at: { '.validate': 'newData.isNumber()' } } },
          adjust: { $key: {
            '.validate': "newData.hasChildren(['team', 'delta', 'at'])",
            team: { '.validate': `newData.isString() && newData.val().matches(${TEAM_RE})` }, delta: { '.validate': num(-1000, 1000) },
            at: { '.validate': 'newData.isNumber()' }, note: { '.validate': str(80) }, $other: { '.validate': false },
          } },
        },

        players: {
          '.read': AUTH,
          $uid: {
            // join: own uid, first write only, room open, not banned. Rename/move/kick: hosts.
            '.write':
              `${AUTH} && (${HOST} || ($uid === auth.uid && ${NOTBAN} && !data.exists() && ${pub('phase')}.exists() && ${pub('settings/lockJoin')}.val() !== true))`,
            '.validate': "newData.hasChildren(['name', 'team', 'joinedAt'])",
            name: { '.validate': 'newData.isString() && newData.val().length >= 2 && newData.val().length <= 24' },
            team: { '.validate': `newData.isString() && ${pub('settings/teams/')}.child(newData.val()).exists()`.replace("settings/teams/')", "settings/teams')") },
            joinedAt: { '.validate': 'newData.isNumber() && newData.val() <= now' },
            $other: { '.validate': false },
          },
        },

        presence: {
          '.read': AUTH,
          $uid: {
            // own presence (joined players and hosts); hosts may also clear anybody's flag (kick)
            '.write': `${AUTH} && (($uid === auth.uid && ${NOTBAN} && (${JOINED} || ${HOST})) || (${HOST} && !newData.exists()))`,
            '.validate': 'newData.isNumber() || newData.isBoolean()',
          },
        },

        reps: {
          '.read': AUTH,
          $team: {
            '.write':
              `${AUTH} && (${HOST} || (${NOTBAN} && ${JOINED} && !data.exists() && newData.val() === auth.uid && ${MY_TEAM}.val() === $team))`,
            '.validate': 'newData.isString()',
          },
        },

        answers: {
          $roundId: {
            '.read': `${AUTH} && ${HOST}`,
            '.write': `${AUTH} && ${HOST}`,
            $uid: {
              '.read': `${AUTH} && $uid === auth.uid`,
              '.write':
                `${AUTH} && $uid === auth.uid && newData.exists() && ${NOTBAN} && ${JOINED} && ${ROUND_OK} && ${phaseIs('answering')} && ${TIMER_OPEN} && ` +
                `(data.exists() ? ${pub('settings/allowEdit')}.val() === true : true) && ${REP_OK}`,
              '.validate': "newData.hasChildren(['text', 'ts', 't0'])",
              text: {
                '.validate':
                  `newData.isString() && newData.val().length >= ${pub('settings/minChars')}.val() && newData.val().length <= ${pub('settings/maxChars')}.val() && newData.val().matches(/[^ \\n\\t\\r]/)`,
              },
              ts: { '.validate': 'newData.val() === now' },
              t0: { '.validate': 'newData.val() === (data.exists() ? data.val() : now)' },
              $other: { '.validate': false },
            },
          },
        },

        submitted: {
          '.read': AUTH,
          $roundId: {
            '.write': `${AUTH} && ${HOST}`,
            $uid: {
              '.write':
                `${AUTH} && $uid === auth.uid && newData.val() === true && ${NOTBAN} && newData.parent().parent().parent().child('answers').child($roundId).child($uid).exists()`,
              '.validate': 'newData.val() === true',
            },
          },
        },

        votes: {
          $roundId: {
            '.read': `${AUTH} && ${HOST}`,
            '.write': `${AUTH} && ${HOST}`,
            $uid: {
              '.read': `${AUTH} && $uid === auth.uid`,
              '.write':
                `${AUTH} && $uid === auth.uid && newData.exists() && ${NOTBAN} && ${JOINED} && ${ROUND_OK} && ${phaseIs('voting')} && ` +
                `${pub('vote/open')}.val() === true && newData.val() >= 0 && newData.val() < ${pub('vote/count')}.val() && ` +
                // never for one's own option: the private mapping optionOf/{round}/{uid} -> option index
                `newData.val() !== ${room('private/optionOf/{round}/{uid}')}.val()`,
              '.validate': 'newData.isNumber()',
            },
          },
        },

        banned: {
          $uid: {
            '.read': `${AUTH} && ($uid === auth.uid || ${HOST})`,
            '.write': `${AUTH} && ${HOST}`,
            '.validate': 'newData.val() === true',
          },
        },
      },
    },
  },
};

export const render = () => JSON.stringify(rules, null, 2) + '\n';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const next = render();
  if (process.argv.includes('--check')) {
    const cur = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (cur !== next) {
      console.error('database.rules.json is out of date. Run: node tools/build-rules.mjs');
      process.exit(1);
    }
    console.log('database.rules.json is up to date');
  } else {
    writeFileSync(OUT, next);
    console.log('wrote', OUT, `(${next.length} bytes)`);
  }
}
