const NULLABLE_STRING = { type: ['string', 'null'] };
const NULLABLE_NUMBER = { type: ['number', 'null'] };

export const KNOWLEDGE_PROPERTIES = {
  statement: { type: 'string', description: 'Nguyên văn câu quản lý viết, tối đa 2000 ký tự.' },
  when_goods: { ...NULLABLE_STRING, description: 'Tên hàng hóa làm điều kiện, như quản lý viết. null nếu không dùng điều kiện hàng hóa.' },
  when_pickup_company: { ...NULLABLE_STRING, description: 'Tên công ty hoặc nơi lấy hàng làm điều kiện, bỏ chữ công ty hoặc cty đứng trước. null nếu không dùng.' },
  when_dropoff_company: {
    ...NULLABLE_STRING,
    description: 'Tên công ty hoặc nơi đổ hàng làm điều kiện, bỏ chữ công ty hoặc cty đứng trước. Dùng cho nơi đổ hàng quản lý nêu trong tuyến, kể cả khi có nơi lấy hàng; giấy tờ in nơi lấy hàng hoặc nơi đổ hàng là đủ. null nếu không dùng.',
  },
  when_vehicle_plate: { ...NULLABLE_STRING, description: 'Biển số xe làm điều kiện, theo định dạng Việt Nam, ví dụ 93C04939. null nếu không dùng.' },
  when_driver_member_id: { ...NULLABLE_STRING, description: 'id tài xế lấy từ list_members. null nếu không dùng.' },
  then_customer: { ...NULLABLE_STRING, description: 'Tên khách hàng là kết quả áp dụng. null nếu không nêu.' },
  then_dropoff: {
    ...NULLABLE_STRING,
    description: 'Nơi đổ hàng là kết quả của các điều kiện khác, khi quản lý không nêu nơi đó như một phần của tuyến, ví dụ "hàng X luôn đổ ở Y". Không dùng cho nơi đổ hàng của tuyến; nơi đó là when_dropoff_company. null nếu không nêu.',
  },
  then_shown_goods: {
    ...NULLABLE_STRING,
    description: 'Tên hàng hiển thị trong báo cáo cho mọi giấy tờ khớp điều kiện, như quản lý viết, ví dụ "Than đá" trong "Than Da, Than đều là Than đá". Tối đa 80 ký tự. null nếu không nêu.',
  },
  then_wage_vnd: { ...NULLABLE_NUMBER, description: 'Lương tài xế cho một chuyến, đơn vị đồng. null nếu không nêu.' },
  then_rate_vnd_per_ton: { ...NULLABLE_NUMBER, description: 'Cước vận chuyển cho một tấn, đơn vị đồng mỗi tấn. null nếu không nêu.' },
  then_allowance_vnd: { ...NULLABLE_NUMBER, description: 'Chi phí bồi dưỡng cho một chuyến, đơn vị đồng. null nếu không nêu.' },
  then_note: { ...NULLABLE_STRING, description: 'Ghi chú lâu dài khác của công ty, chép đúng ý quản lý. null nếu không có.' },
};

export const KNOWLEDGE_PROPERTY_NAMES = Object.keys(KNOWLEDGE_PROPERTIES);
