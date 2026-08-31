# ClipFull

Lịch sử clipboard cho Windows. Giống `Win + V`, nhưng mỗi mục **xem được trọn nội
dung** thay vì một dòng bị cắt cụt bằng dấu ba chấm.

- Bảng chia đôi: danh sách bên trái, **toàn văn** bên phải, cuộn và bôi đen được
- **Hiểu nội dung**: JSON gập được, CSV/TSV thành bảng, URL bóc sẵn query string,
  JWT decode kèm hạn dùng, code tô màu 8 ngôn ngữ
- **Biến đổi nhanh trước khi copy**: format JSON, gỡ hard-wrap, decode base64/URL,
  xoá mã màu ANSI — bản gốc trong lịch sử không đổi
- **So sánh hai mục** cạnh nhau (`Ctrl + D`), gập được phần giống nhau
- **Tìm kiếm toàn văn** (không chỉ trong phần preview), ghim mục, xoá từng mục
- Phím tắt tự đặt (mặc định `Ctrl + Alt + V`)
- Tuỳ chỉnh giao diện: sáng/tối, màu nhấn, cỡ chữ, mật độ, **độ mờ**, nền acrylic/mica
- Chạy cùng Windows, nằm dưới khay hệ thống

v1 chỉ nhận **text** — copy ảnh thì bỏ qua, không lưu.

## Chạy

```bash
npm install
npm run icons     # sinh icon tray + installer
npm run dev       # chạy thử, có hot reload

npm test          # vitest — phần logic thuần (store, dedupe, blob, index hỏng)
npm run lint      # eslint
npm run format    # prettier
```

Test chạy được mà không cần binary Electron: `electron` được thay bằng stub trong
`test/stubs/electron.js`. Nếu mạng của bạn chặn bước tải binary lúc `npm install`
(hay gặp sau proxy có kiểm tra TLS), thì `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install`
vẫn đủ để chạy `npm test` và `npm run lint` — chỉ `npm run dev` là cần binary thật.

## Đóng gói

```bash
npm run dist      # tạo installer NSIS trong release/
```

Installer không ký số, nên lần đầu chạy Windows SmartScreen sẽ cảnh báo
"Windows protected your PC" → **More info** → **Run anyway**. Chỉ một lần.

## Phím

| Phím | Việc |
|---|---|
| `Ctrl + Alt + V` | Mở / đóng bảng (đổi được trong Cài đặt) |
| `↑` `↓` | Chọn mục |
| `Enter` | Copy mục đang chọn rồi đóng bảng |
| `Ctrl + F` | Nhảy vào ô tìm kiếm |
| `F3` / `Shift + F3` | Chỗ khớp kế / trước |
| `Ctrl + D` | Ghim mục này để so sánh, rồi chọn mục khác |
| `Delete` | Xoá mục đang chọn |
| `Esc` | Đóng bảng |

Chọn một mục là **copy vào clipboard**, sau đó bạn tự bấm `Ctrl + V` để dán.
Bản này cố ý không tự động dán — xem *Hướng đi tiếp*.

`Enter` copy cái gì thì tuỳ ngữ cảnh, xét theo thứ tự cụ thể dần:

1. đang **bôi đen** trong pane nội dung → chỉ copy phần bôi đen
2. đang bật một **phép biến đổi** → copy bản đã biến đổi (áp lên toàn văn)
3. còn lại → copy nguyên mục

### Đừng đặt phím tắt là `Ctrl + Shift + V`

Đó là "dán không định dạng" của Chrome, VS Code, Slack, Notion… Đặt nó làm phím
tắt toàn cục là cướp mất phím đó ở **mọi** ứng dụng.

Tổ hợp có phím `Win` cũng không dùng được: Windows giữ phần lớn trong số đó.

## Riêng tư — đọc trước khi dùng

Lịch sử nằm ở `%APPDATA%/ClipFull/history/index.json`, **chữ thường, không mã
hoá**. Bất cứ thứ gì bạn copy đều nằm trong đó.

ClipFull bỏ qua nội dung được đánh dấu bằng các cờ loại trừ của Windows
(`Clipboard Viewer Ignore`, `ExcludeClipboardContentFromMonitorProcessing`,
`CanIncludeInClipboardHistory`) — đây là cách trình quản lý mật khẩu báo "đừng
lưu cái này".

**Đã kiểm chứng đến đâu:** với `Clipboard Viewer Ignore` thì có — đặt clipboard
kèm cờ này thì nội dung không được lưu, đối chứng cùng nội dung không kèm cờ thì
lưu bình thường. **Hai cờ còn lại chưa được kiểm chứng**: tài liệu Electron không
nói rõ `clipboard.has()` đọc được tới đâu trong đám format tuỳ biến của Windows.

Và kể cả cả ba cờ đều chạy, cơ chế này chỉ bắt được trình quản lý mật khẩu nào
*chịu* đặt cờ. Hãy tự kiểm tra bằng nút **Chẩn đoán clipboard** trong Cài đặt:
copy một mật khẩu rồi bấm nút đó, nếu `excluded` là `true` thì cơ chế đang chạy.

Nếu `index.json` hỏng, ClipFull **không** ghi đè lên nó: file được giữ lại thành
`index.corrupt-<thời điểm>.json` và app báo cho bạn biết nó nằm ở đâu.

Ngoài ra: nút **Tạm dừng** ở khay hệ thống, và **Xoá tất cả** (giữ lại mục ghim).

## Kiến trúc

```
src/main/
  index.js     ghép các mảnh, IPC, vòng đời app
  watcher.js   polling clipboard + đọc cờ loại trừ
  store.js     lịch sử trên đĩa, dedupe, tách blob
  window.js    panel: dựng sẵn lúc boot rồi ẩn
  hotkey.js    đăng ký phím tắt, rollback khi hỏng
  tray.js      khay hệ thống — đường vào dự phòng
  settings.js  cấu hình
  search.js    đếm khớp toàn văn + cache LRU theo hash nội dung
src/preload/   cầu IPC (contextIsolation bật)
src/renderer/src/
  App.svelte           master/detail, phím tắt, ghép các mảnh
  lib/DetailPane.svelte chọn viewer, thanh biến đổi
  lib/detect.js        đoán JSON / URL / JWT / bảng / code
  lib/highlight.js     tô màu cú pháp tự viết, 8 ngôn ngữ
  lib/transform.js     các phép biến đổi thuần
  lib/matches.js       cắt text thành mảnh để tô vệt tìm kiếm
  lib/diff.js          so sánh hai mục theo dòng (Myers)
  lib/viewers/         Plain, Json, Table, Url, Jwt
```

Vài quyết định đáng giải thích:

**Polling, không native module.** Electron không có sự kiện "clipboard đã đổi".
Mẹo để không đốt CPU là mỗi nhịp chỉ dựng một chữ ký rẻ tiền từ
`availableFormats()` + hash của text; 99% số nhịp dừng lại ở đó, không đụng tới
`readImage()`. Đổi lại: copy hai lần trong cùng một nhịp thì mất một lần.

**Text dài ra file riêng.** Mục tiêu của app là xem trọn nội dung, nên người dùng
sẽ copy cả file log vào đây. Trên 64KB thì text ra `blobs/<hash>.txt`, `index.json`
chỉ giữ 400 ký tự đầu làm preview. Danh sách mở tức thì; toàn văn đọc lười đúng
lúc chọn mục đó.

**Panel dựng sẵn lúc khởi động rồi ẩn**, không tạo mới mỗi lần bấm phím tắt —
dựng lại renderer mất vài trăm ms, đủ để thấy ì.

**Không dùng `transparent: true`.** Trên Windows nó kéo theo hàng loạt hạn chế.
Cửa sổ đục + `setOpacity()` cho kết quả đẹp và ổn định hơn.

**Chốt chặn vòng lặp.** Chọn một mục là ta ghi vào clipboard, mà watcher lại đang
nhìn clipboard — không đánh dấu `markSelfWrite` thì nó thêm lại chính mục vừa
chọn, vòng vô tận.

**Tray luôn có mục "Mở bảng".** Phím tắt có thể bị ứng dụng khác chiếm; app lại
không có cửa sổ chính. Không có đường vào dự phòng thì mất phím tắt là mất app.

**Tìm kiếm chạy ở main process.** Đó là nơi có toàn văn: `list()` cố tình không
gửi `inline` sang renderer, còn mục dài thì nằm trên đĩa. Renderer vẫn lọc theo
preview để gõ không thấy khựng, kết quả đầy đủ trộn vào sau 150ms.

**Không bao giờ dựng chuỗi HTML từ nội dung clipboard.** Tô màu cú pháp và tô vệt
tìm kiếm đều trả về *mảng token* rồi render bằng `{#each}` để Svelte tự escape.
Đây là dữ liệu hoàn toàn không kiểm soát được — `{@html}` ở đây là mở cửa cho nó
chạy như mã.

**Đang tìm kiếm thì tắt tô màu cú pháp.** Chồng hai lớp tô lên nhau vừa rối vừa
làm phần đánh số vệt tô phức tạp hẳn lên, mà lúc đang tìm thì người ta cần thấy
chỗ khớp chứ không cần thấy từ khoá.

**Tự viết tô màu và nhận diện thay vì kéo Prism/Shiki về.** Dự án giữ nguyên tắc
không có runtime dependency — `scripts/make-icons.mjs` còn tự tay encode PNG.

## Hướng đi tiếp

- **Tự động dán** vào ứng dụng đang dùng: nhớ cửa sổ foreground → trả focus →
  gửi `Ctrl+V`. Cần native module (nut.js hoặc addon N-API). Đây là thứ tách app
  này khỏi cảm giác "còn thiếu một bước".
- **Ảnh** trong lịch sử (`type` trong data model đã chừa sẵn chỗ).
- **Mã hoá `index.json`** bằng `safeStorage` của Electron (dùng DPAPI của
  Windows). Đọc/ghi index đã gom vào một chỗ nên thay được dễ.
- Native clipboard listener thay polling, nếu thấy sót lần copy.
