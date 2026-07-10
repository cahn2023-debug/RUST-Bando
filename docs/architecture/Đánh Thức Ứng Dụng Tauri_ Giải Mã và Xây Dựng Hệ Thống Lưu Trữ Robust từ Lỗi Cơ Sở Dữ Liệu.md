# Đánh Thức Ứng Dụng Tauri: Giải Mã và Xây Dựng Hệ Thống Lưu Trữ Robust từ Lỗi Cơ Sở Dữ Liệu

Báo cáo nghiên cứu này cung cấp một phân tích chuyên sâu và toàn diện về hai lỗi cơ sở dữ liệu nghiêm trọng trong một ứng dụng desktop hiện đại sử dụng stack Tauri (Rust backend) và React/TypeScript (frontend). Các lỗi được xác định là "no such table: pmp_metadata" khi tạo dự án mới và lỗi xung đột file DuckDB do mở trùng lặp khi tải lại dự án. Nghiên cứu tập trung vào việc chẩn đoán nguyên nhân gốc rễ, đề xuất các giải pháp khắc phục cụ thể cho từng vấn đề, và đưa ra các khuyến nghị chiến lược nhằm cải thiện kiến trúc tổng thể của hệ thống để tăng cường độ tin cậy và khả năng bảo trì. Báo cáo dựa hoàn toàn trên các tài liệu và thông tin được cung cấp, đảm bảo tính chính xác và trung thực trong mọi lập luận và đề xuất.

## Phân Tích Gốc Rễ Lỗi Schema SQLite: 'không có bảng nào tên là pmp_metadata'

Lỗi "Failed to set project_id in metadata: no such table: pmp_metadata" tại `CreateProjectModal.tsx:48` là một sự cố liên quan đến cấu trúc cơ sở dữ liệu SQLite, cho thấy một điểm yếu nghiêm trọng trong quy trình khởi tạo và quản lý trạng thái của ứng dụng. Bản chất của lỗi này là hệ thống cố gắng thực hiện một thao tác ghi (viết) vào một bảng có tên `pmp_metadata`, nhưng bảng đó không tồn tại trong file cơ sở dữ liệu đang được truy cập. Đây không chỉ là một lỗi cú pháp SQL đơn thuần mà là biểu hiện của một lỗ hổng kiến trúc trong việc đảm bảo rằng môi trường cơ sở dữ liệu luôn sẵn sàng và nhất quán trước khi bất kỳ logic nghiệp vụ nào được kích hoạt. Để hiểu rõ nguyên nhân, chúng ta cần phân tích sâu quy trình khởi động ứng dụng, cơ chế hoạt động của SQLite trong môi trường Rust, và vai trò của từng thành phần trong chuỗi phản ứng của lỗi.

Trước hết, cần xác định vị trí và luồng gây ra lỗi. Thông báo lỗi bắt nguồn từ `CreateProjectModal.tsx` tại dòng 48, trong hàm `handleSubmit`. Khi người dùng nhấn nút gửi trong hộp thoại tạo dự án, hàm `handleSubmit` được gọi. Hàm này, dựa trên phân tích sơ bộ, chịu trách nhiệm gửi một yêu cầu đến backend Rust thông qua giao thức IPC (IPC) của Tauri để xử lý việc tạo dự án [[2](https://blog.csdn.net/gitblog_00340/article/details/151442855)]. Backend Rust, sau khi nhận được yêu cầu, sẽ thực hiện các thao tác liên quan đến cơ sở dữ liệu, bao gồm cả việc ghi nhận ID dự án mới vào bảng `pmp_metadata`. Tại thời điểm đó, nếu bảng `pmp_metadata` chưa được tạo, câu lệnh SQL sẽ thất bại và trả về lỗi "no such table". Điều này cho thấy một khoảng trống thời gian hoặc một logic thiếu sót giữa khi ứng dụng khởi động và khi yêu cầu tạo dự án được gửi đi.

Nguyên nhân gốc rễ của lỗi này nằm ở sự thiếu vắng một cơ chế "bootstrap" (khởi tạo) robust (bền vững) cho cơ sở dữ liệu SQLite. Mặc dù thư viện `rusqlite` cho phép tạo một file database mới nếu nó không tồn tại khi mở kết nối [[19](https://rustwiki.org/zh-CN/rust-cookbook/database/sqlite.html)], điều này không đồng nghĩa với việc schema bên trong file đó cũng được tự động tạo ra. Việc định nghĩa các bảng, chỉ mục và ràng buộc là trách nhiệm của nhà phát triển. Một cách phổ biến và đáng tin cậy để giải quyết vấn đề này là sử dụng câu lệnh SQL `CREATE TABLE IF NOT EXISTS ...` [[49](https://stackoverflow.com/questions/2477099/create-table-if-not-exists-how-to-check-the-schema-too)] hoặc thực thi một tập lệnh migration (khởi tạo) khi ứng dụng bắt đầu. Trong trường hợp này, ứng dụng dường như không có một bước kiểm tra hoặc tạo schema nào được thực thi chắc chắn trước khi chấp nhận bất kỳ yêu cầu nào liên quan đến việc ghi dữ liệu. Do đó, nếu đây là lần đầu tiên ứng dụng chạy, hoặc file database bị xóa/corrupt, thì khi `handleSubmit` được kích hoạt, backend Rust sẽ tìm kiếm bảng `pmp_metadata` nhưng không thấy nó, dẫn đến lỗi ngay lập tức.

Kiến trúc của ứng dụng, với sự phân tách rõ ràng giữa frontend React và backend Rust, đặt ra những yêu cầu đặc biệt cho việc quản lý trạng thái cơ sở dữ liệu. Frontend (React) đóng vai trò là lớp giao diện người dùng, chịu trách nhiệm thu thập dữ liệu và tương tác với người dùng. Nó không nên biết chi tiết về cấu trúc database; thay vào đó, nó chỉ cần gửi các yêu cầu hành động (ví dụ: "tạo dự án với tên X") đến backend [[4](https://dev.to/mdabir1203/tauri-framework-code-first-deep-dive-e1-411d)]. Backend Rust, với quyền truy cập sâu hơn vào hệ thống tệp và tài nguyên máy tính, phải chịu trách nhiệm duy trì trạng thái của cơ sở dữ liệu. Việc phân tách này là một lợi ích, nhưng cũng tạo ra một điểm yếu tiềm tàng: nếu backend không tự bảo vệ mình khỏi các trạng thái database không mong muốn, frontend có thể dễ dàng kích hoạt các lỗi như vậy. Hiện tại, logic xử lý trong backend Rust dường như không có cơ chế "try-catch" hoặc kiểm tra schema, khiến nó dễ bị tổn thương trước các điều kiện môi trường không hoàn chỉnh.

Hệ quả trực tiếp của lỗi này là phá vỡ luồng chức năng quan trọng nhất của ứng dụng: tạo một dự án mới. Người dùng gặp phải một trải nghiệm gián đoạn và thất vọng khi họ không thể hoàn thành hành động cơ bản nhất. Về mặt kỹ thuật, điều này cho thấy ứng dụng thiếu khả năng tự phục hồi (self-healing). Một ứng dụng robust nên có khả năng tự nhận biết khi cơ sở dữ liệu của nó ở trạng thái không đầy đủ và tự động sửa chữa nó mà không cần can thiệp thủ công từ người dùng. Ví dụ, nó có thể tự động tạo các bảng cần thiết hoặc chuyển sang một chế độ khôi phục.

Các tài liệu tham khảo cung cấp một số hướng đi để giải quyết vấn đề này. Việc sử dụng `CREATE TABLE IF NOT EXISTS` là một phương pháp đơn giản và hiệu quả để tránh lỗi thiếu bảng [[49](https://stackoverflow.com/questions/2477099/create-table-if-not-exists-how-to-check-the-schema-too)]. Ngoài ra, các framework ORM như Drizzle ORM có thể giúp quản lý schema một cách type-safe (kiểu an toàn), tự động tạo ra các câu lệnh SQL cần thiết để xây dựng hoặc cập nhật database [[21](https://dev.to/huakun/building-a-local-first-tauri-app-with-drizzle-orm-encryption-and-turso-sync-31pn)]. Tuy nhiên, ngay cả khi không sử dụng ORM, việc xây dựng một module khởi tạo database riêng biệt trong Rust là một giải pháp tối ưu. Module này sẽ chứa tất cả các câu lệnh SQL cần thiết để tạo ra toàn bộ schema ban đầu. Sau đó, trong hàm `main` của ứng dụng Tauri, ngay trước khi đăng ký các command IPC, một hàm `initialize_database()` sẽ được gọi để đảm bảo rằng schema đã sẵn sàng. Cách tiếp cận này tách biệt logic khởi tạo khỏi logic nghiệp vụ, làm cho mã nguồn sạch sẽ và dễ bảo trì hơn.

Một kịch bản cụ thể có thể diễn ra như sau:
1.  Người dùng khởi động ứng dụng. File database `project_data.sqlite` không tồn tại.
2.  Backend Rust khởi động và gọi hàm `initialize_database()`.
3.  Hàm này mở kết nối đến `project_data.sqlite`. Vì file không tồn tại, `rusqlite` sẽ tạo nó [[19](https://rustwiki.org/zh-CN/rust-cookbook/database/sqlite.html)].
4.  Hàm này thực thi một câu lệnh SQL để tạo bảng `pmp_metadata`: `CREATE TABLE IF NOT EXISTS pmp_metadata (id INTEGER PRIMARY KEY, project_id TEXT, ...);`
5.  Quá trình khởi tạo thành công. Backend đăng ký các command IPC.
6.  Người dùng tạo một dự án mới. Frontend gửi IPC command `create_project`.
7.  Backend nhận command và thực thi câu lệnh `INSERT INTO pmp_metadata ...`. Bảng đã tồn tại, nên thao tác thành công.

Nếu bước 4 bị bỏ qua hoặc thực thi không thành công (ví dụ, do lỗi ngữ pháp SQL), thì khi bước 7 diễn ra, lỗi "no such table" sẽ xảy ra. Do đó, việc thêm và đảm bảo hàm `initialize_database()` luôn được gọi là giải pháp cốt lõi cho vấn đề này. Ngoài ra, cần xem xét thêm các bảng khác có thể cần thiết cho hệ thống quản lý dự án, không chỉ riêng `pmp_metadata`.

| Thành phần | Vai trò / Nhiệm vụ | Điểm yếu phát hiện |
| :--- | :--- | :--- |
| **Frontend (React)** | Thu thập dữ liệu từ người dùng, gửi yêu cầu IPC đến backend. | Không kiểm tra trạng thái database, gửi yêu cầu ngay lập tức khi người dùng hành động. |
| **Backend (Rust/Tauri)** | Xử lý yêu cầu IPC, tương tác với cơ sở dữ liệu SQLite. | Thiếu logic khởi tạo (bootstrap) để đảm bảo schema luôn tồn tại trước khi xử lý yêu cầu ghi. |
| **Thư viện Rusqlite** | Thư viện Rust để tương tác với cơ sở dữ liệu SQLite. | Chỉ tự động tạo file database, không tự động tạo schema bên trong. Yêu cầu logic của nhà phát triển để tạo bảng. [[6](https://stackoverflow.com/questions/tagged/rusqlite?tab=Newest), [19](https://rustwiki.org/zh-CN/rust-cookbook/database/sqlite.html)] |
| **Quy trình khởi động** | Chuẩn bị môi trường cho ứng dụng trước khi hoạt động. | Thiếu bước xác minh và tạo schema cơ sở dữ liệu, dẫn đến trạng thái không nhất quán. |

Tóm lại, lỗi 'no such table: pmp_metadata' là một lời cảnh tỉnh về sự cần thiết phải xây dựng một quy trình khởi động mạnh mẽ và đáng tin cậy cho ứng dụng. Nó không chỉ là một lỗi đơn lẻ cần sửa, mà là một chỉ báo cho thấy kiến trúc quản lý trạng thái của ứng dụng cần được xem xét lại. Bằng cách thêm một cơ chế khởi tạo database chắc chắn vào backend Rust, chúng ta có thể loại bỏ rủi ro này và tạo nền tảng cho một hệ thống bền vững hơn.

## Điều Tra Vấn Đề Quản Lý Kết Nối DuckDB: 'Tập tin đã được mở'

Lỗi "DuckDB initialization failed at D:\\...\\analytics.duckdb: IO Error: File is already open in D:\\...\\project-manager.exe (PID 5992)" liên quan đến cơ sở dữ liệu DuckDB, một lỗi hoàn toàn khác về bản chất so với lỗi SQLite. Nếu lỗi SQLite là do thiếu cấu trúc (schema), thì lỗi DuckDB lại xoay quanh việc quản lý trạng thái của một tài nguyên đang hoạt động: kết nối cơ sở dữ liệu. Lỗi này báo rằng tiến trình hiện tại (PID 5992, chính là ứng dụng `project-manager.exe`) đã cố gắng mở một file `analytics.duckdb` mà nó đã có một kết nối tới và không cho phép mở kết nối thứ hai, ngay cả từ chính nó. Điều này cho thấy một vấn đề nghiêm trọng về vòng đời của đối tượng kết nối DuckDB trong backend Rust.

Để hiểu rõ nguyên nhân, trước hết cần nắm vững đặc điểm kỹ thuật của DuckDB. DuckDB là một cơ sở dữ liệu OLAP (Online Analytical Processing) embeddable, thường được mệnh danh là "SQLite for analytics" [[16](https://deepnote.com/blog/ultimate-guide-to-duckdb-library-in-python), [35](https://feeds.acast.com/public/shows/629a6154b4e1e70012764c00)]. Một trong những đặc điểm cốt lõi của DuckDB là sự quản lý khóa chặt chẽ đối với các kết nối. Theo tài liệu, một file DuckDB chỉ có thể có tối đa một kết nối độc quyền (writable connection) tại một thời điểm [[1](https://stackoverflow.com/questions/77364053/can-i-open-duckdb-file-in-read-only-mode-while-other-process-writing-to-the-the)]. Mặc dù nhiều kết nối đọc (read-only) có thể tồn tại song song, việc mở một kết nối ghi mới sẽ thất bại nếu bất kỳ kết nối nào (độc quyền hoặc đọc) đang hoạt động [[53](https://stackoverflow.com/questions/77364053/can-i-open-duckdb-file-in-read-only-mode-while-other-process-writing-to-the-the/77364169)]. Đây là một cơ chế bảo vệ toàn vẹn dữ liệu để tránh xung đột khi viết đồng thời. Do đó, việc một tiến trình không thể mở lại chính file database của mình nếu nó vẫn đang "mở" là một hành vi mong muốn, chứ không phải là một lỗi phần mềm. Vấn đề ở đây là ứng dụng đang cố gắng thực hiện hành vi không mong muốn đó.

Lỗi xảy ra tại hàm `load_pmp_file` trong backend Rust, được gọi bởi `useProjectManager.ts` khi người dùng thực hiện hành động xóa dự án. Điều này gợi ý một kịch bản có thể xảy ra: khi một dự án được tải lên (hoặc thao tác nào đó liên quan đến `analytics.duckdb`), hàm `load_pmp_file` mở một kết nối DuckDB. Sau khi hoàn thành công việc, nếu hàm này không có logic để đóng kết nối một cách tường minh, kết nối đó sẽ "treo" trong tiến trình của ứng dụng. Khi người dùng thực hiện hành động tiếp theo (ví dụ: xóa dự án), hàm `load_pmp_file` (hoặc một hàm tương tự) lại được gọi. Backend Rust lại cố gắng mở kết nối tới cùng một file `analytics.duckdb`. Lúc này, DuckDB phát hiện kết nối cũ vẫn còn, nên từ chối kết nối thứ hai và báo lỗi. Đây là một vấn đề điển hình về quản lý tài nguyên, cụ thể là tài nguyên kết nối cơ sở dữ liệu.

Vòng đời của kết nối database cần được quản lý một cách chặt chẽ. Một kết nối không được sử dụng nữa phải được đóng ngay lập tức để giải phóng tài nguyên và cho phép các thao tác khác có thể thực hiện. Trong môi trường Rust, nơi quản lý bộ nhớ rất quan trọng, việc sử dụng RAII (Resource Acquisition Is Initialization) là một nguyên tắc tốt. Đối tượng kết nối DuckDB (ví dụ: `Connection` object from `duckdb-rs`) nên có một destructor (drop trait) đảm bảo rằng khi đối tượng đó thoát khỏi phạm vi (scope), kết nối sẽ được đóng một cách tự động. Tuy nhiên, nếu kết nối được lưu trữ ở một nơi có vòng đời dài hơn (ví dụ, trong một struct chia sẻ trạng thái của ứng dụng - `AppState`), thì nó sẽ không bị đóng cho đến khi `AppState` bị hủy.

Có hai hướng tiếp cận chính để giải quyết vấn đề này:

1.  **Sử dụng một Service Manager Singleton:** Đây là cách tiếp cận chuyên nghiệp và được khuyến nghị cao nhất. Ý tưởng là tạo ra một service hoặc manager duy nhất trong backend Rust để quản lý kết nối DuckDB. Service này sẽ chịu trách nhiệm mở kết nối một lần duy nhất khi ứng dụng khởi động và giữ nó mở cho đến khi ứng dụng tắt. Mọi thao tác cần truy cập DuckDB sẽ không mở kết nối mới, mà sẽ gửi một yêu cầu đến service manager này. Service manager sẽ thực thi câu lệnh và trả về kết quả. Cách tiếp cận này đảm bảo rằng luôn có đúng một kết nối đang hoạt động, loại bỏ hoàn toàn khả năng xảy ra lỗi "file is already open". Nó cũng có thể mang lại hiệu suất tốt hơn vì tránh được chi phí tốn kém của việc mở và đóng kết nối nhiều lần.

2.  **Đảm bảo đóng kết nối trong khối `finally` (RAII):** Nếu không thể sử dụng mô hình singleton (ví dụ, do các ràng buộc kiến trúc phức tạp), giải pháp thay thế là đảm bảo rằng mọi hàm mở kết nối DuckDB đều được bọc trong một cấu trúc đảm bảo kết nối được đóng. Trong Rust, điều này có thể đạt được bằng cách sử dụng `match` hoặc `if let` để xử lý kết quả và đảm bảo kết nối rời khỏi phạm vi của nó. Ví dụ, một hàm mở kết nối có thể trông như sau:
    ```rust
    fn perform_operation_duckdb() -> Result<(), Box<dyn std::error::Error>> {
        let conn = Connection::open("analytics.duckdb")?; // Kết nối được tạo trong scope này
        // Thực thi các câu lệnh trên `conn`
        Ok(()) // Kết nối `conn` sẽ được giải phóng (và đóng) tại đây, ngay cả khi có lỗi xảy ra
    }
    ```
    Bằng cách này, vòng đời của đối tượng kết nối `conn` được giới hạn trong hàm `perform_operation_duckdb`. Ngay khi hàm kết thúc (dù thành công hay thất bại), destructor của `conn` sẽ được gọi, đóng kết nối và trả lại tài nguyên cho hệ thống. Cách tiếp cận này đòi hỏi kỷ luật trong việc quản lý phạm vi của các đối tượng kết nối.

Hơn nữa, để tăng cường tính nhất quán của dữ liệu, các thao tác trên DuckDB nên được bao quanh bởi một transaction. DuckDB hỗ trợ các giao dịch atomic, có nghĩa là một loạt các thao tác sẽ hoặc là tất cả đều thành công, hoặc tất cả đều thất bại và được rollback về trạng thái ban đầu [[14](https://www.cnblogs.com/ytwang/p/19611845)]. Điều này giúp ngăn chặn cơ sở dữ liệu rơi vào trạng thái bán thành phẩm nếu có lỗi xảy ra giữa chừng.

Lỗi này cũng phơi bày một vấn đề trong giao tiếp giữa frontend và backend. Hàm `load_pmp_file` có vẻ như là một hàm RPC (Remote Procedure Call) được gọi qua IPC. Nếu mỗi lần gọi hàm này đều tạo ra một kết nối mới mà không có cơ chế quản lý, nó sẽ vô tình tái tạo lỗi. Cần xem xét lại thiết kế API IPC này để nó không phụ thuộc vào việc quản lý kết nối database ở phía client (frontend).

| Biện pháp | Mô tả | Ưu điểm | Nhược điểm |
| :--- | :--- | :--- | :--- |
| **Service Manager Singleton** | Tạo một service duy nhất để quản lý một kết nối DuckDB duy nhất cho toàn bộ ứng dụng. | Loại bỏ hoàn toàn lỗi "already open", hiệu suất cao do giảm chi phí mở/kết nối, logic tập trung. | Có thể phức tạp hơn để triển khai, yêu cầu thay đổi kiến trúc lớn. |
| **RAII / Scope Management** | Đảm bảo mỗi kết nối DuckDB chỉ tồn tại trong một phạm vi hẹp và được đóng khi thoát khỏi phạm vi đó. | Dễ triển khai cho các hàm riêng lẻ, tận dụng được cơ chế quản lý tài nguyên tự động của Rust. | Vẫn có thể có nhiều kết nối cùng lúc nếu không cẩn thận, hiệu suất thấp hơn do mở/kết nối nhiều lần. |
| **Transaction Batching** | Bao quanh các thao tác trên DuckDB bằng một giao dịch để đảm bảo tính toàn vẹn dữ liệu. | Đảm bảo tính toàn vẹn dữ liệu (atomicity), dễ dàng rollback nếu có lỗi. | Không giải quyết được vấn đề "already open", chỉ là một biện pháp bổ sung. |

Tóm lại, lỗi "File is already open" là một bài toán về quản lý tài nguyên và vòng đời. Nó không phải là một lỗi của DuckDB, mà là một hệ quả trực tiếp của việc ứng dụng không quản lý kết nối của mình một cách cẩn thận. Việc áp dụng một trong hai giải pháp trên—sử dụng một manager kết nối duy nhất hoặc đảm bảo kết nối được đóng đúng cách thông qua quản lý phạm vi—sẽ giải quyết triệt để vấn đề này và giúp ứng dụng trở nên ổn định hơn.

## Tổng Hợp Kiến Trúc và Các Rủi Ro Tiềm Ẩn Phơi Bộc

Việc phân tích hai lỗi cơ sở dữ liệu seemingly unrelated này—một lỗi thiếu cấu trúc (SQLite) và một lỗi quản lý trạng thái (DuckDB)—phơi bày một bức tranh sâu sắc hơn về những điểm yếu kiến trúc và các rủi ro tiềm ẩn trong toàn bộ hệ thống ứng dụng. Chúng không phải là những sự cố riêng lẻ mà là những triệu chứng của cùng một căn bệnh: sự thiếu nhất quán và thiếu kiểm soát trong việc quản lý trạng thái và tài nguyên của ứng dụng. Bằng cách tổng hợp các phân tích, chúng ta có thể xác định các vấn đề cốt lõi ảnh hưởng đến toàn bộ kiến trúc Tauri + React.

**1. State Management Phân tán và Race Condition:**
Như đã dự đoán trong kế hoạch ban đầu, việc quản lý trạng thái phân tán giữa nhiều store Redux slice và các hook tùy chỉnh (như trong `stores/`) có thể dẫn đến các tình trạng đua và trạng thái lỗi thời [[4](https://dev.to/mdabir1203/tauri-framework-code-first-deep-dive-e1-411d)]. Trong bối cảnh này, điều này có thể biểu hiện thành việc frontend gửi đi nhiều yêu cầu IPC liên tục mà không chờ đợi phản hồi từ backend. Ví dụ, khi người dùng nhanh chóng nhấn nút nhiều lần, ứng dụng có thể tạo ra hàng loạt yêu cầu `create_project` hoặc `load_pmp_file`. Nếu backend không có cơ chế xếp hàng hoặc xử lý các yêu cầu này một cách tuần tự, nó có thể bị quá tải. Điều này không chỉ làm chậm ứng dụng mà còn có thể tạo ra các trạng thái không mong muốn, chẳng hạn như cố gắng mở nhiều kết nối DuckDB cùng lúc hoặc cố gắng ghi vào một cơ sở dữ liệu SQLite chưa sẵn sàng. Sự thiếu đồng bộ giữa các thành phần UI và trạng thái backend qua IPC có thể tạo ra một "vùng mù" trạng thái mà ứng dụng khó có thể tự phục hồi [[50](https://stackoverflow.com/questions/75771786/typeerror-window-tauri-ipc-is-not-a-function-on-tauri)].

**2. Thiếu cơ chế Bootstrap Robust và Self-Healing:**
Cả hai lỗi đều bắt nguồn từ việc ứng dụng không tự bảo vệ mình khỏi các điều kiện môi trường không hoàn chỉnh. Lỗi SQLite là ví dụ kinh điển: ứng dụng giả định rằng schema đã tồn tại mà không kiểm tra. Lỗi DuckDB, mặc dù khác, cũng phản ánh điều này: ứng dụng không quản lý được trạng thái "mở" của một kết nối. Một ứng dụng "local-first" đáng tin cậy, vốn phụ thuộc nhiều vào dữ liệu cục bộ, cần có một quy trình khởi động mạnh mẽ và khả năng tự phục hồi [[21](https://dev.to/huakun/building-a-local-first-tauri-app-with-drizzle-orm-encryption-and-turso-sync-31pn)]. Điều này bao gồm việc xác minh và tạo lại các tài nguyên cần thiết (database schema, file log, thư mục tạm) một cách nhất quán mỗi khi ứng dụng khởi động. Việc thiếu một quy trình bootstrap được chuẩn hóa khiến ứng dụng dễ bị tổn thương trước các tình huống bất ngờ như người dùng xóa tệp dữ liệu thủ công, cập nhật phần mềm không thành công, hoặc khởi động trên một máy tính mới.

**3. IPC Communication Risky và Lack of Standardization:**
Giao tiếp giữa frontend (React) và backend (Rust) thông qua IPC là xương sống của ứng dụng Tauri [[2](https://blog.csdn.net/gitblog_00340/article/details/151442855)]. Tuy nhiên, giao tiếp này có thể trở nên cực kỳ rủi ro nếu không được thiết kế một cách cẩn thận. Các vấn đề tiềm ẩn bao gồm:
*   **Thiếu xác thực:** Frontend gửi dữ liệu không được xác thực đầy đủ ở phía backend, tạo ra lỗ hổng bảo mật [[4](https://dev.to/mdabir1203/tauri-framework-code-first-deep-dive-e1-411d)].
*   **Không đồng bộ hóa:** Các yêu cầu không có cơ chế đồng bộ, dẫn đến race condition khi backend xử lý không kịp.
*   **Thiếu logic retry và timeout:** Nếu một IPC call bị mất hoặc backend crash, frontend có thể treo hoặc báo lỗi mà không có cách nào tự thử lại.
*   **Binding kiểu dữ liệu sai:** Lỗi có thể xảy ra khi truyền các kiểu dữ liệu phức tạp giữa hai môi trường ngôn ngữ khác nhau (JavaScript và Rust).
Giải pháp đề xuất là chuẩn hóa IPC bằng cách sử dụng các best practice như luôn truyền một `requestId` cho mỗi yêu cầu, backend trả về phản hồi kèm `requestId`, và frontend sử dụng một hàng đợi Promise để quản lý các yêu cầu, đảm bảo chúng được xử lý theo thứ tự và có logic retry/thời gian chờ (timeout) [[43](https://lobehub.com/skills/lispking-tauri-skills-tauri-v2)].

**4. Migration và Schema Management Yếu:**
Sự tồn tại của các module như `migration.rs` và các script như `restore_v3_data.rs` cho thấy rằng hệ thống đã trải qua các thay đổi về schema trong quá khứ [[7](https://stackoverflow.com/questions/tagged/tauri?tab=Newest), [36](https://stackoverflow.com/questions/79630659/in-tauri-v2-how-can-i-get-a-my-resource-path-before-tauribuilder)]. Tuy nhiên, việc lỗi xảy ra cho thấy quy trình migration này có thể không được vận hành suôn sẻ. Một quy trình migration tốt phải đáp ứng các tiêu chí sau:
*   **Atomic:** Hoàn thành hoặc thất bại toàn bộ, không để database ở trạng thái nửa vời.
*   **Rollback Support:** Có các kịch bản rollback để khôi phục dữ liệu nếu migration thất bại.
*   **Versioning:** Luôn có một bảng hoặc tệp tin ghi lại phiên bản schema hiện tại để tránh chạy lại các migration cũ.
*   **Dry-run Validation:** Có khả năng kiểm tra migration mà không cần áp dụng nó lên cơ sở dữ liệu thực.
Việc thiếu các cơ chế này có thể dẫn đến việc database bị corrupt hoặc không tương thích khi ứng dụng cập nhật [[23](https://www.scribd.com/document/752533028/cektitle)].

**5. Build Artifacts and Dependency Pollution:**
Kế hoạch ban đầu đã chỉ ra rủi ro nhiễm build artifacts vào kho mã nguồn, ví dụ như các thư mục `temp_target_audit/debug/build/` [[30](https://dev.to/truongpx396/zeroclaw-deep-dive-a-build-it-yourself-guide-1hmi)]. Mặc dù không trực tiếp gây ra hai lỗi database, điều này có thể gián tiếp ảnh hưởng đến sự ổn định của ứng dụng. Các tệp nhị phân cũ hoặc các phiên bản thư viện không tương thích có thể gây ra các lỗi khó lường. Việc không `.gitignore` đúng cách các thư mục như `target/` và `pkg/` là một thực hành xấu, làm phình to kho mã nguồn và có thể gây xung đột cache trong CI/CD [[25](https://s3.jcloud.sjtu.edu.cn/899a892efef34b1b944a19981040f55b-oss01/crates.io/crates/mirror_clone_list.html)]. Một hệ thống xây dựng sạch sẽ là nền tảng cho việc tạo ra các bản dựng có thể lặp lại và đáng tin cậy.

Tóm lại, hai lỗi cơ sở dữ liệu ban đầu chỉ là những vết nứt nhỏ trên bề mặt của một tòa nhà kiến trúc đang có dấu hiệu xuống cấp. Chúng cho thấy sự cần thiết phải thực hiện một cuộc cải tổ toàn diện, không chỉ sửa chữa các vấn đề cụ thể mà còn xây dựng lại các trụ cột cốt lõi của ứng dụng: quy trình khởi động, quản lý trạng thái, giao tiếp IPC và xử lý lỗi. Việc bỏ qua những vấn đề này sẽ chỉ dẫn đến việc các lỗi tương tự tiếp tục xuất hiện, làm giảm uy tín và khả năng mở rộng của sản phẩm.

## Đề Xuất Giải Pháp Triệt Để cho Lỗi SQLite và DuckDB

Dựa trên phân tích sâu về nguyên nhân gốc rễ của hai lỗi, báo cáo này đề xuất một bộ giải pháp cụ thể, có cấu trúc và triệt để để khắc phục các sự cố đang tồn tại và ngăn ngừa chúng tái diễn. Các giải pháp được chia thành hai nhóm: các sửa đổi mã nguồn cấp thiết để vá lỗi và các thay đổi kiến trúc dài hạn để tăng cường độ tin cậy.

### **Giải pháp cho Lỗi Schema SQLite ('no such table: pmp_metadata')**

Lỗi này có thể được khắc phục bằng cách đảm bảo rằng schema SQLite được tạo ra một cách chắc chắn trước khi bất kỳ thao tác nào liên quan đến dữ liệu được thực hiện.

**1. Implement Database Bootstrap (Backend - Rust):**
Đây là giải pháp cốt lõi. Cần tạo một module mới trong `src-tauri/src` (ví dụ: `database/bootstrap.rs`) để đóng gói toàn bộ logic khởi tạo.

*   **Hành động:** Tạo hàm `pub async fn initialize_sqlite_database(db_path: &str) -> Result<(), Box<dyn std::error::Error>>`.
*   **Logic:**
    *   Mở kết nối đến file SQLite tại `db_path`. Thư viện `rusqlite` sẽ tự động tạo file nếu nó không tồn tại [[19](https://rustwiki.org/zh-CN/rust-cookbook/database/sqlite.html)].
    *   Thực thi câu lệnh SQL để tạo bảng `pmp_metadata` nếu nó chưa tồn tại. Sử dụng `CREATE TABLE IF NOT EXISTS` là phương pháp chuẩn mực [[49](https://stackoverflow.com/questions/2477099/create-table-if-not-exists-how-to-check-the-schema-too)]. Ví dụ:
        ```sql
        CREATE TABLE IF NOT EXISTS pmp_metadata (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            -- Thêm các cột khác cần thiết
        );
        ```
    *   Bổ sung logic để tạo các bảng khác có thể cần thiết cho hệ thống quản lý dự án.
*   **Triển khai:** Gọi hàm `initialize_sqlite_database` một cách chắc chắn trong hàm `main` của `src-tauri/src/main.rs`, ngay sau khi khởi tạo `tauri::Builder` và trước khi đăng ký bất kỳ IPC command nào. Điều này đảm bảo rằng database luôn ở trạng thái sẵn sàng khi ứng dụng bắt đầu.

**2. Refactor Frontend Logic (React):**
*   **Hành động:** Sửa đổi hàm `handleSubmit` trong `CreateProjectModal.tsx`.
*   **Logic:** Đảm bảo rằng hàm này không thực hiện bất kỳ logic nghiệp vụ phức tạp nào. Nó chỉ nên thực hiện các tác vụ UI (hiển thị loading, validate input) và sau đó gửi một IPC command đơn giản đến backend. Ví dụ: `invoke('create_project', { projectName: '...' })`.
*   **Lý do:** Chuyển giao toàn bộ trách nhiệm xử lý nghiệp vụ, bao gồm cả việc ghi vào database, cho backend Rust. Điều này tuân thủ nguyên tắc tốt là chạy các kiểm tra và thao tác quan trọng ở phía backend để tránh bị người dùng can thiệp [[4](https://dev.to/mdabir1203/tauri-framework-code-first-deep-dive-e1-411d)].

### **Giải pháp cho Lỗi DuckDB ('File Is Already Open')**

Lỗi này cần được giải quyết bằng cách quản lý vòng đời của kết nối DuckDB một cách chặt chẽ.

**1. Adopt a Singleton Connection Manager (Backend - Rust):**
Đây là giải pháp tối ưu và được khuyến nghị cao nhất để loại bỏ lỗi vĩnh viễn.

*   **Hành động:** Tạo một module quản lý kết nối duy nhất (ví dụ: `database/duckdb_manager.rs`). Module này sẽ sử dụng một struct để lưu trữ kết nối DuckDB.
*   **Logic:**
    *   Struct `DuckDbManager` sẽ có một trường `connection: Option<Connection>`.
    *   Cung cấp một hàm `pub async fn get_instance(db_path: &str) -> Result<&'static DuckDbManager, Box<dyn std::error::Error>>`. Hàm này sẽ sử dụng `lazy_static` hoặc `OnceCell` để đảm bảo chỉ có một instance của `DuckDbManager` được tạo ra trong suốt vòng đời của ứng dụng.
    *   Trong hàm `get_instance`, nếu kết nối chưa được mở, nó sẽ mở kết nối đến `db_path` và lưu vào trường `connection`. Nếu đã mở, nó sẽ trả về instance hiện có.
    *   Mọi hàm trong manager này sẽ lấy tham chiếu đến kết nối đã mở.
*   **Triển khai:** Thay đổi tất cả các hàm trong backend cần truy cập DuckDB (bao gồm `load_pmp_file`) để chúng không mở kết nối mới. Thay vào đó, chúng sẽ lấy instance của `DuckDbManager` và sử dụng các hàm của nó để thực thi câu lệnh.

**2. Alternative: Strict Scope Management with RAII (Backend - Rust):**
Nếu việc triển khai singleton phức tạp, đây là một giải pháp thay thế hiệu quả.

*   **Hành động:** Sửa đổi các hàm mở kết nối DuckDB (ví dụ: `load_pmp_file`).
*   **Logic:** Đảm bảo đối tượng kết nối `duckdb::Connection` chỉ tồn tại trong một phạm vi hàm. Khi hàm kết thúc, đối tượng kết nối sẽ tự động được giải phóng và đóng, nhờ cơ chế `Drop` của Rust.
    ```rust
    pub async fn load_pmp_file_handler(...) -> Result<(), String> {
        // Kết nối chỉ tồn tại trong khối này
        let conn = Connection::open("path/to/analytics.duckdb")?;
        
        // Thực thi các câu lệnh trên `conn`
        // ...
        
        Ok(()) // Kết nối `conn` được đóng tại đây
    }
    ```

**3. Implement Transactions for Data Integrity:**
*   **Hành động:** Bao quanh các chuỗi thao tác trên DuckDB bằng một giao dịch.
*   **Logic:** Sử dụng `conn.transaction()` để đảm bảo các thao tác là nguyên tử. Nếu bất kỳ lệnh nào trong giao dịch thất bại, toàn bộ giao dịch sẽ bị rollback, giữ cho cơ sở dữ liệu ở trạng thái nhất quán [[14](https://www.cnblogs.com/ytwang/p/19611845)].

### **Bảng tổng hợp giải pháp**

| Vấn đề | Thành phần | Giải pháp Chính | Mã nguồn liên quan | Mục tiêu |
| :--- | :--- | :--- | :--- | :--- |
| **Lỗi SQLite** | Backend (Rust) | Tạo hàm `initialize_database()` và gọi nó trong `main.rs` | `src-tauri/src/database/bootstrap.rs`, `main.rs` | Đảm bảo schema SQLite luôn tồn tại trước khi xử lý yêu cầu. |
| **Lỗi SQLite** | Frontend (React) | Refactor `handleSubmit` để chỉ gửi yêu cầu IPC | `CreateProjectModal.tsx` | Chuyển giao logic nghiệp vụ cho backend, tăng bảo mật và kiểm soát. |
| **Lỗi DuckDB** | Backend (Rust) | Áp dụng Singleton Pattern cho quản lý kết nối | `src-tauri/src/database/duckdb_manager.rs` | Đảm bảo chỉ có một kết nối DuckDB duy nhất, loại bỏ lỗi "already open". |
| **Lỗi DuckDB** | Backend (Rust) | Sử dụng RAII (quản lý phạm vi) cho kết nối | `useProjectManager.ts` (gọi IPC), các hàm IPC liên quan | Đảm bảo kết nối được đóng ngay lập tức khi không còn sử dụng. |
| **Lỗi DuckDB** | Backend (Rust) | Bao quanh thao tác bằng Transaction | Các hàm trong `duckdb_manager.rs` hoặc IPC handler | Đảm bảo tính toàn vẹn dữ liệu (atomicity) khi có nhiều thao tác. |

Bằng cách triển khai các giải pháp trên, ứng dụng sẽ không chỉ giải quyết được hai lỗi đang báo động mà còn xây dựng được một nền tảng vững chắc hơn cho việc quản lý cơ sở dữ liệu. Việc tách biệt logic khởi tạo, áp dụng các mẫu thiết kế phù hợp và tăng cường tính toàn vẹn dữ liệu sẽ góp phần nâng cao đáng kể độ tin cậy và khả năng bảo trì của ứng dụng trong dài hạn.

## Chiến Lược Cải Tiến Kiến Trúc Tổng thể để Tăng Độ Tin Cậy

Để vượt ra ngoài việc chỉ vá các lỗi cụ thể và xây dựng một ứng dụng thực sự bền vững, cần phải thực hiện một chiến lược cải tiến kiến trúc tổng thể. Các giải pháp cấp tốc, dù hiệu quả, chỉ là một phần của câu chuyện. Phần còn lại nằm ở việc xây dựng lại các trụ cột cốt lõi của ứng dụng dựa trên các nguyên tắc thiết kế tốt nhất. Chiến lược này tập trung vào bốn lĩnh vực chính: quản lý trạng thái, giao tiếp nội bộ, xử lý lỗi, và quy trình phát triển.

**1. Tái cấu trúc Quản lý Trạng thái (State Management):**
Kiến trúc hiện tại với nhiều store Redux slice và các hook tùy chỉnh có thể dẫn đến trạng thái lỗi thời, các tình trạng đua và các lần render không cần thiết [[4](https://dev.to/mdabir1203/tauri-framework-code-first-deep-dive-e1-411d)]. Để giải quyết vấn đề này, nên cân nhắc chuyển sang một thư viện quản lý trạng thái nhẹ hơn và linh hoạt hơn như **Zustand**.

*   **Lý do:** Zustand hoạt động dựa trên một store duy nhất, giảm thiểu sự phân tán của trạng thái. Nó có cơ chế batching tự động, giảm thiểu các lần render không cần thiết. Việc tích hợp với React khá đơn giản và mã nguồn gọn gàng hơn nhiều so với Redux.
*   **Triển khai:** Chuyển các slices Redux hiện có (designActionSlice, drawingSlice, v.v.) thành các hooks sử dụng Zustand. Tách biệt rõ ràng giữa trạng thái giao diện người dùng (UI state) và trạng thái dữ liệu nghiệp vụ (domain state). UI state có thể được quản lý cục bộ hơn, trong khi domain state được tập trung hóa.
*   **Lợi ích:** Giảm thiểu các tình trạng đua, cải thiện hiệu suất, và làm cho việc đồng bộ hóa trạng thái giữa các component trở nên dễ dàng và đáng tin cậy hơn. Zustand cũng dễ dàng tích hợp với `useSyncExternalStore` để đồng bộ hóa trạng thái với backend Rust một cách hiệu quả [[4](https://dev.to/mdabir1203/tauri-framework-code-first-deep-dive-e1-411d)].

**2. Chuẩn hóa và Tối ưu hóa Giao tiếp IPC:**
IPC là xương sống của ứng dụng Tauri, và việc thiết kế nó một cách cẩu thả sẽ tạo ra các điểm yếu nghiêm trọng. Cần áp dụng các best practice để biến IPC từ một nguồn rủi ro thành một kênh giao tiếp đáng tin cậy.

*   **Lý do:** Giao tiếp không được chuẩn hóa có thể dẫn đến các lỗi khó phát hiện, thiếu đồng bộ, và trải nghiệm người dùng kém.
*   **Triển khai:**
    *   **Áp dụng Request-Reply Pattern với `requestId`:** Mọi yêu cầu từ frontend đến backend phải bao gồm một `requestId` duy nhất. Backend khi trả lời phải bao gồm `requestId` đó. Frontend sẽ quản lý một đối tượng `Promise` trong một map, key là `requestId`. Khi phản hồi đến, nó sẽ resolve `Promise` tương ứng.
    *   **Thêm Timeout và Retry Logic:** Mỗi IPC call nên có một thời gian chờ. Nếu không nhận được phản hồi trong thời gian quy định, ứng dụng nên thử lại một vài lần. Điều này giúp ứng dụng chống chịu với các lỗi mạng tạm thời hoặc backend bị quá tải.
    *   **Sử dụng Hàng đợi Promise:** Để tránh race condition, các yêu cầu IPC có thể được đưa vào một hàng đợi FIFO (First-In, First-Out) và được xử lý tuần tự thay vì đồng thời.
*   **Lợi ích:** Tăng cường khả năng chống chịu lỗi, đảm bảo các yêu cầu được xử lý theo thứ tự, và cung cấp một cơ chế phản hồi nhất quán cho người dùng.

**3. Xây dựng Cơ chế Xử lý Lỗi Đồng nhất và Sâu sắc:**
Hiện tại, ứng dụng có thể đang hiển thị các thông báo lỗi mơ hồ như "IO Error". Cần xây dựng một hệ thống xử lý lỗi mạnh mẽ và nhất quán ở cả phía backend và frontend.

*   **Lý do:** Lỗi không được xử lý tốt có thể khiến người dùng bối rối và không thể chẩn đoán vấn đề.
*   **Triển khai:**
    *   **Tại Backend (Rust):** Sử dụng crate `thiserror` để định nghĩa một enum lỗi chung cho ứng dụng, ví dụ `AppError`. Enum này sẽ bao gồm tất cả các loại lỗi có thể xảy ra (database error, file I/O error, validation error, v.v.). Mọi command IPC phải trả về kiểu `Result<T, AppError>`.
    *   **Tại Frontend (React):** Tạo một hàm ánh xạ lỗi từ enum `AppError` của Rust sang các thông báo lỗi thân thiện với người dùng (toast notification, modal). Ví dụ, `AppError::TableNotFound("pmp_metadata")` có thể được ánh xạ thành "Ứng dụng đang gặp sự cố. Vui lòng khởi động lại." thay vì một thông báo kỹ thuật.
*   **Lợi ích:** Cung cấp trải nghiệm người dùng tốt hơn, giúp người dùng hiểu rõ hơn về vấn đề (nếu có thể), và cung cấp cho nhà phát triển các thông tin chẩn đoán hữu ích hơn thông qua các log được cấu trúc hóa.

**4. Củng cố Quy trình Phát triển và Xây dựng (CI/CD):**
Một hệ thống phát triển lành mạnh là nền tảng cho việc tạo ra phần mềm chất lượng.

*   **Lý do:** Các vấn đề như tệp nhị phân dính vào kho mã nguồn hoặc các bản dựng không thể lặp lại có thể phá vỡ quy trình phát triển và gây ra các lỗi khó lường.
*   **Triển khai:**
    *   **.gitignore:** Đảm bảo tất cả các thư mục build và artifact được thêm vào `.gitignore`. Các mục cần thiết bao gồm `target/`, các thư mục trong `temp_target_*`, và các tệp `.wasm` (nếu chúng được tạo ra trong quá trình build).
    *   **Reproducible Builds:** Sử dụng các công cụ như `sccache` trong CI/CD để đệm các bản dựng Rust, giúp tăng tốc độ và đảm bảo các bản dựng trên các runner khác nhau là giống hệt nhau [[30](https://dev.to/truongpx396/zeroclaw-deep-dive-a-build-it-yourself-guide-1hmi)]. Cố gắng đóng gói các phiên bản của các dependency quan trọng.
    *   **Automated Testing:** Xây dựng một hệ thống kiểm thử tự động. Sử dụng `cargo test` cho các kiểm thử đơn vị và kiểm thử_integration cho backend Rust, sử dụng `vitest` cho frontend React, và `Playwright` cho các kiểm thử đầu cuối. Mục tiêu là đạt tỷ lệ che phủ mã > 80% [[4](https://dev.to/mdabir1203/tauri-framework-code-first-deep-dive-e1-411d)].
*   **Lợi ích:** Tăng tốc độ phát triển, đảm bảo chất lượng code, và giảm thiểu các lỗi do môi trường phát triển không đồng nhất gây ra.

Bằng cách thực hiện các cải tiến kiến trúc này, nhóm phát triển không chỉ giải quyết được các vấn đề hiện tại mà còn xây dựng được một hệ thống có khả năng mở rộng, dễ bảo trì và đáng tin cậy hơn. Đây là một khoản đầu tư dài hạn, nhưng nó sẽ mang lại giá trị to lớn trong việc giảm thiểu các lỗi tương lai và tăng tốc độ phát triển của ứng dụng.