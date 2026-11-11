// Six built-in situations. Theme: "Khám phá bản thân & Thích ứng với sự thay đổi" (grade 11, Vietnam).
// Each has a real trade-off and no obvious right answer; `criteria` are host-only grading hints.
export const SCENARIOS = [
  {
    id: 'b1',
    title: 'Y Dược hay thiết kế',
    time: 120,
    text:
      'Bố mẹ Minh muốn cậu đăng ký tổ hợp môn khối B để thi vào Y hoặc Dược. Họ nói nghề bác sĩ ổn định, họ hàng ai cũng ủng hộ. ' +
      'Nhưng Minh lại mê thiết kế đồ họa: cậu tự học phần mềm hơn một năm, từng làm poster cho câu lạc bộ của trường và thấy mình thật sự sống động khi làm việc đó. ' +
      'Hạn đăng ký tổ hợp môn chỉ còn một tuần. Nếu chọn theo bố mẹ, Minh sợ mình sẽ học mà không có hứng thú. Nếu chọn theo mình, cậu sợ làm bố mẹ thất vọng và không có đường lui. ' +
      'Nếu em là Minh, em sẽ làm gì trong một tuần này?',
    criteria: [
      'Có bước cụ thể trong một tuần, không chỉ nói "sẽ trò chuyện".',
      'Hiểu lo lắng thật của bố mẹ thay vì coi đó là sự áp đặt.',
      'Có cách kiểm tra lựa chọn của mình bằng thông tin, không chỉ bằng cảm xúc.',
      'Tính đến phương án dự phòng nếu quyết định không như mong muốn.',
    ],
  },
  {
    id: 'b2',
    title: 'Chuyển sang thành phố mới',
    time: 120,
    text:
      'Giữa học kỳ một, bố của Lan được điều chuyển công tác sang thành phố khác và cả nhà sẽ chuyển đi sau hai tuần nữa. Lan có nhóm bạn thân từ hồi lớp 6 và vừa giành được suất chính thức trong đội bóng chuyền của trường, đang tập cho giải thành phố. ' +
      'Đi nghĩa là bỏ lại tất cả, vào một lớp mới khi mọi người đã quen nhau. Lan cũng có thể ở lại nhà bà ngoại đến hết năm học, nhưng sẽ xa bố mẹ gần một năm. ' +
      'Lan muốn thích nghi nhanh, nhưng không muốn giả vờ ổn khi lòng đang nặng trĩu. ' +
      'Nếu em là Lan, em sẽ quyết định và chuẩn bị như thế nào?',
    criteria: [
      'Nêu rõ lựa chọn đi hay ở và lý do, có cân nhắc cái được và cái mất.',
      'Có cách giữ liên lạc với bạn cũ và làm quen với môi trường mới.',
      'Thừa nhận cảm xúc của bản thân mà không bị cảm xúc chi phối quyết định.',
      'Có sự trao đổi với gia đình, không tự quyết một mình.',
    ],
  },
  {
    id: 'b3',
    title: 'Bị loại khỏi đội tuyển',
    time: 120,
    text:
      'Sau hai năm học trong đội tuyển học sinh giỏi Toán, Khôi bất ngờ nhận thông báo bị loại khỏi đội trước kỳ thi cấp tỉnh. Suất của Khôi được trao cho Nam, người bạn thân ngồi cạnh cậu. ' +
      'Cô giáo nói quyết định dựa trên ba bài thi thử gần nhất, và Khôi biết điểm của mình thật sự đã giảm. Nam nhắn tin xin lỗi, nhưng Khôi vừa buồn vừa tự ái nên chưa trả lời. ' +
      'Hai người vẫn ngồi chung bàn mỗi ngày, và cả lớp đang chờ xem họ cư xử với nhau ra sao. ' +
      'Nếu em là Khôi, em sẽ xử lý cảm xúc, tình bạn và mục tiêu học tập của mình như thế nào?',
    criteria: [
      'Tách được cảm xúc với việc đánh giá lại năng lực của chính mình.',
      'Có cách cư xử cụ thể với Nam, không né tránh cũng không giả vờ.',
      'Có kế hoạch học tập tiếp theo, không bỏ cuộc sau một thất bại.',
      'Không đổ lỗi cho cô giáo hay bạn.',
    ],
  },
  {
    id: 'b4',
    title: 'Sáu tiếng mỗi ngày trên mạng',
    time: 120,
    text:
      'Mỗi ngày Hà dành khoảng sáu tiếng cho mạng xã hội và video ngắn. Điểm Toán và tiếng Anh của Hà tụt hai học kỳ liên tiếp, sáng nào cũng buồn ngủ trên lớp. ' +
      'Hà biết mình cần thay đổi, nhưng điện thoại cũng là nơi cậu giữ liên lạc với bạn bè. Tối nào nhóm bạn thân cũng rủ chơi game đến khuya; nếu từ chối, Hà sợ bị cho là khó chịu và dần bị bỏ ra ngoài. ' +
      'Hà cũng không muốn bố mẹ tịch thu điện thoại, vì sẽ mất cả liên lạc lẫn sự tin tưởng. ' +
      'Nếu em là Hà, em sẽ thay đổi thói quen bắt đầu từ đâu, và nói với các bạn thế nào?',
    criteria: [
      'Bắt đầu từ thay đổi nhỏ, đo được, thay vì "từ nay bỏ hẳn".',
      'Có cách nói với nhóm bạn để vẫn giữ được tình bạn.',
      'Nhận ra nguyên nhân (giấc ngủ, thói quen) chứ không chỉ trách điện thoại.',
      'Chủ động xin hỗ trợ từ bố mẹ trước khi bị cấm.',
    ],
  },
  {
    id: 'b5',
    title: 'Gia đình gặp khó khăn',
    time: 150,
    text:
      'Bố của Trang vừa mất việc, mẹ làm thu nhập không ổn định, và cả nhà bắt đầu cắt giảm chi tiêu. Trang đang ôn thi chứng chỉ tiếng Anh để xin học bổng du học. ' +
      'Có ba hướng: đi làm thêm ở quán cà phê để phụ giúp gia đình nhưng mất thời gian học; học thêm ở trung tâm với chi phí lớn mà bố mẹ sẵn sàng gánh; hoặc tự học ở nhà và giữ nguyên mọi khoản chi. ' +
      'Mẹ nói cứ lo học, nhưng Trang thấy rõ mẹ đang lo lắng thế nào. Trang không muốn thành gánh nặng, cũng không muốn bỏ ước mơ. ' +
      'Nếu em là Trang, em sẽ chọn cách nào và nói chuyện với bố mẹ ra sao?',
    criteria: [
      'Cân nhắc đủ ba hướng, nêu được cái được và cái mất của hướng mình chọn.',
      'Nói chuyện thẳng thắn, tôn trọng cảm xúc của bố mẹ.',
      'Có kế hoạch học hiệu quả với ít thời gian và ít tiền hơn.',
      'Không hy sinh hoàn toàn ước mơ, cũng không bỏ qua thực tế của gia đình.',
    ],
  },
  {
    id: 'b6',
    title: 'Nghề mơ ước và trí tuệ nhân tạo',
    time: 150,
    text:
      'Quân mơ trở thành kế toán. Trong một buổi hướng nghiệp, diễn giả nói nhiều dự báo cho rằng phần lớn công việc kế toán cơ bản có thể do trí tuệ nhân tạo làm trong mười năm tới. ' +
      'Cả lớp xôn xao, vài bạn bắt đầu đổi hướng, còn bố mẹ Quân phân vân có nên khuyên con chọn nghề khác hay không. ' +
      'Quân hoang mang: bỏ nghề mình thích chỉ vì một dự báo có thể là hấp tấp; nhưng nếu phớt lờ, cậu có thể học một thứ sẽ không còn nhiều chỗ làm. Hạn chọn tổ hợp môn đang đến gần. ' +
      'Nếu em là Quân, em sẽ đánh giá thông tin này và chuẩn bị cho tương lai ra sao?',
    criteria: [
      'Biết kiểm tra nguồn và mức chắc chắn của dự báo trước khi quyết định.',
      'Phân biệt công việc bị thay thế với nghề bị biến mất; nghĩ đến kỹ năng khó thay thế.',
      'Có kế hoạch linh hoạt, không chọn tất cả hoặc không gì cả.',
      'Giữ được động lực thật sự với nghề, không chạy theo số đông.',
    ],
  },
];

export const scenarioWords = (s) => s.text.trim().split(/\s+/).length;
