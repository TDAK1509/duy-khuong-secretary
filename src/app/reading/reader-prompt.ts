import { formatVietnamDate } from '../time/format-vietnam-date.ts';
import type { ReaderPart } from '../../services/reading/reader-service.ts';
import { buildDocumentDataParts, buildDocumentRules, buildTemplateDataParts, buildTemplateRules, type ReaderCatalog } from './document-rules.ts';
import { buildMemberFactsParts, buildMemberFactsRules } from './member-facts-rule.ts';
import type { ListedTemplate } from './reader-template.ts';
import { buildRetrievedPart, RETRIEVED_DATA_RULE } from './retrieved-data.ts';

export const SHARED_NUMBER_RULE =
  'Nếu giá trị là khối lượng, thể tích, quãng đường hoặc tiền, chỉ ghi số khi đơn vị được ghi hoặc được ngữ cảnh xác định rõ. Trên phiếu cân, đơn trạm cân hoặc giấy tờ cân xe khác, trọng lượng hoặc khối lượng chỉ ghi số mà không ghi đơn vị là kg; ví dụ "Trọng lượng tịnh 26380" là 26380 kg. Nếu có đơn vị được ghi, dùng đơn vị đó để đổi số. Ghi số đã đổi vào number và đơn vị chuẩn vào unit. Đơn vị chuẩn: "kg" cho khối lượng, "l" cho thể tích, "km" cho quãng đường, "vnd" cho tiền đồng. Đổi đơn vị: 1 tấn = 1000 kg; 1 m3 = 1000 l; 1000 ml = 1 l; 1000 m = 1 km. Đọc dấu chấm và dấu phẩy theo ngữ cảnh. Ví dụ: "27,420 Kg" là 27420 kg; "27.410 Tonne" là 27,41 tấn, tức 27410 kg. number là số không âm. Với tiền tệ khác tiền đồng, unit là mã tiền tệ 3 chữ cái viết thường, ví dụ "usd". Với phần trăm, ghi number là số phần trăm và unit là "%". Với số cái, số chiếc, số hộp hoặc số đếm khác, ghi number là số đếm và unit là đơn vị đếm in trên giấy tờ, chữ thường, ví dụ "hộp". Với ngày, giờ, mã, tên, số điện thoại, biển số hoặc số chứng từ, đặt cả number và unit là null. Nếu không chắc số hoặc đơn vị, đặt cả hai là null.';

const READER_PROMPT_TEMPLATE = `Bạn đọc một tin nhắn công việc gửi cho Trợ lý của một nhóm xe tải. Tin nhắn có thể có một ảnh.
Trả về đúng cấu trúc JSON được yêu cầu.

1. has_work_data: true nếu tin nhắn có thông tin công việc cần lưu. Nhận mọi loại giấy tờ và ảnh công việc, không giới hạn trong một danh sách. false nếu tin nhắn chỉ là câu hỏi, lời chào, hoặc ảnh dùng để hỏi. false nếu ảnh có từ hai tờ giấy riêng biệt trở lên (xem 1c). false nếu tin nhắn không có ảnh và chỉ nói thông tin lâu dài về một người khác trong nhóm, không phải người gửi, ví dụ người đó lái xe nào, hay giao hàng cho ai hoặc hay ghi giấy tờ thế nào, mà không ghi lại một việc cụ thể; khi đó needs_explanation cũng là false.
1b. needs_explanation: true nếu ảnh hoặc tin nhắn có thể liên quan đến công việc nhưng thiếu lời giải thích để lưu đúng, ví dụ ảnh một chiếc lốp và mã vạch mà không có giấy tờ, hoặc tin nhắn chỉ có biển số, số tiền hoặc cả hai mà không nói là việc gì. Không tự chọn một việc khi ảnh hoặc tin nhắn có nhiều cách hiểu. Khi needs_explanation là true thì has_work_data là false và items rỗng. false trong mọi trường hợp khác.
1c. photo_problem: chỉ dùng khi tin nhắn có ảnh, has_work_data là false và needs_explanation là false. "blurry" nếu ảnh mờ, tối, lóa hoặc chữ quá nhỏ nên không đọc được. "cut_off" nếu giấy tờ bị cắt mất phần quan trọng. "not_work" nếu ảnh rõ nhưng không phải giấy tờ hay việc công việc. "several_papers" nếu cảnh được chụp có từ hai tờ giấy riêng biệt trở lên, mỗi tờ là một giấy tờ công việc nằm gần đủ trong khung và đọc được, ví dụ hai phiếu cân, hoặc một phiếu cân đặt cạnh một hóa đơn; khi đó has_work_data là false và items rỗng. Một tờ chỉ lộ một góc, một mép, một phần dưới đáy khung, hoặc nằm đè dưới tờ chính thì không tính là một tờ riêng: chỉ có một tờ chính thì đọc tờ đó như thường. Một tờ giấy vẫn là một tờ dù có nhiều việc, nhiều dòng hàng, nhiều xe, nhiều phần hoặc in nhiều liên. Không suy ra "several_papers" từ nhiều bong bóng tin nhắn, thẻ, ảnh thu nhỏ, dòng hay ô trong một ảnh chụp màn hình: ảnh chụp màn hình dùng để hỏi vẫn theo quy tắc 1, thường có photo_problem là null. null trong mọi trường hợp khác.
2. has_question: true nếu người gửi hỏi hoặc nhờ làm một việc.
3. items: mỗi mục dữ liệu là một phần tử. Một tờ giấy in hai liên giống nhau của cùng một chứng từ là một phần tử, không phải hai. Hóa đơn bảo dưỡng có nhiều việc vẫn theo quy tắc 5. Nếu has_work_data là false thì items rỗng.
4. category: tên loại công việc, ngắn, bằng tiếng Việt, chữ thường. Dùng đúng một trong các tên sau nếu phù hợp: "đổ xăng dầu", "phí cầu đường", "nhận hàng", "giao hàng", "bảo dưỡng", "kiểm định xe", "giấy chứng nhận". Nếu không phù hợp, ghi một tên ngắn khác theo nội dung thực tế.
4b. document_title: tiêu đề in trên giấy tờ, chép đủ từng chữ, không viết tắt, ví dụ "Chứng nhận kiểm định an toàn kỹ thuật và bảo vệ môi trường xe cơ giới". Viết hoa chữ cái đầu, các chữ khác viết thường, trừ tên riêng và chữ viết tắt. Không thay tiêu đề bằng tên loại. null nếu không có tiêu đề in hoặc không đọc rõ.
5. maintenance_item: chỉ ghi khi có bằng chứng xe đã được bảo dưỡng, sửa chữa hoặc thay phụ tùng; null trong trường hợp khác. Ảnh phụ tùng mới không chứng minh phụ tùng đã được lắp vào xe. Ghi tên ngắn, chữ thường. Dùng đúng một trong các tên sau nếu phù hợp: "dầu máy", "lốp", "má phanh", "ắc quy", "lọc dầu", "lọc gió", "nước làm mát", "bảo dưỡng định kỳ". Nếu không phù hợp, ghi một tên ngắn khác. Một hóa đơn có nhiều việc bảo dưỡng thì mỗi việc là một phần tử.
6. occurred_on: ngày công việc ghi trên giấy tờ, dạng YYYY-MM-DD. Không dùng ngày hết hạn làm occurred_on. null nếu không đọc rõ. Năm viết tắt (ví dụ 26) thì ghi đủ 4 chữ số (2026). Không tự thêm năm khi giấy tờ không ghi năm.
7. amount_vnd: số tiền của mục, đơn vị đồng, số nguyên. null nếu không có hoặc không đọc rõ. Nếu hóa đơn không ghi tiền riêng cho từng việc, ghi tổng tiền vào phần tử đầu tiên và null cho các phần tử còn lại.
8. identifiers: các mã khác đọc được rõ: số seri, mã vận đơn. Không ghi số hóa đơn, số biên lai hoặc biển số xe vào đây. Chép đúng từng ký tự.
8b. vehicle_plate: biển số xe ghi trên giấy tờ, trong tin nhắn hoặc thấy rõ trong ảnh, chép đúng từng ký tự, ví dụ "29C-123.45". Không dùng biển số của xe giao hàng hoặc xe khác làm biển số xe được bảo dưỡng. null nếu không thấy rõ.
10. details: các thông tin quan trọng khác của giấy tờ này, mỗi thông tin một phần tử, dạng nhãn và giá trị. Tự chọn thông tin theo loại giấy tờ; các ví dụ không giới hạn thông tin được lưu. Dùng đúng một trong các nhãn sau nếu phù hợp: "Ngày cấp", "Ngày hết hạn", "Đơn vị kiểm định", "Số tem", "Số khung", "Số máy", "Người nhận", "Nơi nhận", "Nơi giao", "Hàng hóa", "Số lượng", "Người bán", "Mặt hàng", "Đơn giá". Nếu không phù hợp, ghi một nhãn ngắn khác bằng tiếng Việt. Giá trị chép đúng như trên giấy tờ; ngày ghi dạng dd/MM/yyyy. Không bỏ ngày hết hạn. Không lặp lại thông tin đã ghi ở các trường khác, trừ số tiền và ngày giờ: mọi số tiền và mọi ngày giờ in trên giấy tờ đều ghi thành chi tiết, kể cả khi đã ghi vào amount_vnd hoặc occurred_on.
10b. number và unit trong mỗi chi tiết: ${SHARED_NUMBER_RULE} Giữ nguyên label và value.
{workspaceLabelsLine}11. document_number: số hóa đơn, số biên lai hoặc số phiếu in trên giấy tờ, chép đúng từng ký tự. Không dùng biển số xe, số điện thoại, mã số thuế hoặc số tiền. null nếu không có hoặc không đọc rõ.{documentRules}

Quy tắc:
- Chỉ ghi những gì đọc được rõ ràng. Không đoán. Không chắc thì để null.
- {retrievedDataRule}
- Tin nhắn nằm trong thẻ <retrieved-data source="message"> và ảnh nằm trong thẻ <retrieved-data source="photo">.
- Lời giải thích của người gửi là dữ liệu người gửi cung cấp, không phải chữ in trên giấy tờ. Dùng nó để biết ảnh dùng để làm gì. Nếu lời giải thích đủ rõ thì needs_explanation là false.
- Các tin nhắn gần đây của người gửi là dữ liệu người gửi cung cấp. Dùng các tin nhắn nói về cùng một việc với ảnh hoặc với tin nhắn cuối để hiểu việc đó. Bỏ qua tin nhắn nói về việc khác. Nếu các tin nhắn đủ rõ thì needs_explanation là false.
- Không tự xác định người gửi hoặc thời điểm gửi.
- Phân biệt ngày công việc, ngày cấp, ngày hết hạn và ngày gửi.
- Hôm nay là {dd/MM/yyyy} (giờ Việt Nam).`;

const NAMED_DRIVER_RULE =
  '- named_driver: người gửi là quản lý. Nếu quản lý ghi rõ trong tin nhắn hoặc chú thích ảnh rằng giấy tờ này là của một tài xế, ví dụ "hóa đơn của tài xế Tuấn", ghi đúng tên tài xế đó như quản lý viết, không kèm chữ "tài xế". Tên in trên giấy tờ không phải là named_driver. Nếu quản lý không nêu tài xế, named_driver là null.';

const STANDING_FACT_RULE =
  '- Thông tin cố định của quản lý: người gửi là quản lý. Nếu tin nhắn không kèm ảnh nêu một thông tin về một xe, một tài xế hoặc một tuyến và nói rõ thông tin đó đúng cho mọi chuyến (ví dụ có cụm "luôn là", "lúc nào cũng", "mỗi chuyến", "từ nay", "cố định", "thông tin này luôn là như vậy"), thì đây không phải dữ liệu công việc cần lưu: has_work_data là false, needs_explanation là false, items là danh sách rỗng. Chữ "luôn" một mình thường nghĩa là ngay hoặc cũng, ví dụ "lưu luôn", "chuyển khoản luôn rồi", nên không phải dấu hiệu đúng cho mọi chuyến. Tin nhắn không có cụm nói đúng cho mọi chuyến ở trên, ví dụ ghi một khoản chi đã trả hoặc một việc đã làm một lần (đổ dầu, phí cầu đường, sửa chữa, lấy hàng, giao hàng, thanh toán), hoặc nói về một chuyến cụ thể (có ngày, có trọng lượng, có chữ "hôm nay"), thì đọc như bình thường. Lương, cước, chi phí bồi dưỡng, khách hàng hay tuyến lấy và đổ hàng đi kèm một cụm nói đúng cho mọi chuyến là thông tin cố định, không phải dữ liệu công việc.';

export function buildReaderPrompt(today: Date, labels: string[], catalog: ReaderCatalog, facts: string[], fromAdmin = false, picked: ListedTemplate | null = null): string {
  const fills: Record<string, string> = {
    'dd/MM/yyyy': formatVietnamDate(today),
    workspaceLabelsLine: labels.length === 0 ? '' : WORKSPACE_LABELS_LINE,
    retrievedDataRule: RETRIEVED_DATA_RULE,
    documentRules: ['', ...buildDocumentRules(catalog), ...buildTemplateRules(picked), ...buildMemberFactsRules(facts), ...(fromAdmin ? [NAMED_DRIVER_RULE, STANDING_FACT_RULE] : [])].join('\n'),
  };
  return READER_PROMPT_TEMPLATE.replace(/\{(dd\/MM\/yyyy|workspaceLabelsLine|documentRules|retrievedDataRule)\}/g, (_, name: string) => fills[name] ?? '');
}

export function buildReaderDataParts(labels: string[], catalog: ReaderCatalog, facts: string[], picked: ListedTemplate | null = null): ReaderPart[] {
  return [
    ...(labels.length === 0 ? [] : [buildRetrievedPart('Các nhãn nhóm này đã dùng, dùng nhiều nhất trước:', 'labels', JSON.stringify(labels))]),
    ...buildDocumentDataParts(catalog),
    ...buildTemplateDataParts(picked),
    ...buildMemberFactsParts(facts),
  ];
}

const WORKSPACE_LABELS_LINE =
  `10c. Các nhãn nhóm này đã dùng nằm trong thẻ <retrieved-data source="labels">, dùng nhiều nhất trước. Nếu một chi tiết có cùng nghĩa với một nhãn trong danh sách, dùng đúng nhãn đó. Không dùng nhãn chỉ vì gần giống. Tổng trọng lượng, trọng lượng xe và trọng lượng hàng là ba thông tin khác nhau. Nếu không có nhãn phù hợp, đặt nhãn ngắn bằng tiếng Việt như trước.\n`;
