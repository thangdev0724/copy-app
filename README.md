# ClipFull

Lịch sử clipboard cho Windows. Giống `Win + V`, nhưng mỗi mục **xem được trọn nội
dung** thay vì một dòng bị cắt cụt bằng dấu ba chấm.

- Bảng chia đôi: danh sách bên trái, **toàn văn** bên phải, cuộn và bôi đen được
- Tìm kiếm, ghim mục, xoá từng mục
- Phím tắt tự đặt (mặc định `Ctrl + Alt + V`)
- Tuỳ chỉnh giao diện: sáng/tối, màu nhấn, cỡ chữ, mật độ, **độ mờ**, nền acrylic/mica
- Chạy cùng Windows, nằm dưới khay hệ thống

v1 chỉ nhận **text** — copy ảnh thì bỏ qua, không lưu.

## Chạy

```bash
npm install
npm run icons     # sinh icon tray + installer
npm run dev       # chạy thử, có hot reload
```

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
| `Delete` | Xoá mục đang chọn |
| `Esc` | Đóng bảng |

Chọn một mục là **copy vào clipboard**, sau đó bạn tự bấm `Ctrl + V` để dán.
v1 cố ý không tự động dán — xem *Hướng đi tiếp*.

### Đừng đặt phím tắt là `Ctrl + Shift + V`

Đó là "dán không định dạng" của Chrome, VS Code, Slack, Notion… Đặt nó làm phím
tắt toàn cục là cướp mất phím đó ở **mọi** ứng dụng.

Tổ hợp có phím `Win` cũng không dùng được: Windows giữ phần lớn trong số đó.

## Riêng tư — đọc trước khi dùng

Lịch sử nằm ở `%APPDATA%/clipfull/history/index.json`, **chữ thường, không mã
hoá**. Bất cứ thứ gì bạn copy đều nằm trong đó.

ClipFull bỏ qua nội dung được đánh dấu bằng các cờ loại trừ của Windows
(`Clipboard Viewer Ignore`, `ExcludeClipboardContentFromMonitorProcessing`,
`CanIncludeInClipboardHistory`) — đây là cách trình quản lý mật khẩu báo "đừng
lưu cái này".

**Đã kiểm chứng:** đặt clipboard kèm cờ `Clipboard Viewer Ignore` thì nội dung
không được lưu; đối chứng cùng nội dung không kèm cờ thì lưu bình thường. Nhưng
không phải trình quản lý mật khẩu nào cũng đặt cờ — hãy tự kiểm tra bằng nút
**Chẩn đoán clipboard** trong Cài đặt: copy một mật khẩu rồi bấm nút đó, nếu
`excluded` là `true` thì cơ chế đang chạy.

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
src/preload/   cầu IPC (contextIsolation bật)
src/renderer/  Svelte: master/detail, cài đặt, ô ghi phím tắt
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

## Hướng đi tiếp

- **Tự động dán** vào ứng dụng đang dùng: nhớ cửa sổ foreground → trả focus →
  gửi `Ctrl+V`. Cần native module (nut.js hoặc addon N-API). Đây là thứ tách app
  này khỏi cảm giác "còn thiếu một bước".
- **Ảnh** trong lịch sử (`type` trong data model đã chừa sẵn chỗ).
- **Mã hoá `index.json`** bằng `safeStorage` của Electron (dùng DPAPI của
  Windows). Đọc/ghi index đã gom vào một chỗ nên thay được dễ.
- Native clipboard listener thay polling, nếu thấy sót lần copy.
