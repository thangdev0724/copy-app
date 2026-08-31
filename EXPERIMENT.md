# Thí nghiệm: tự động dán

Nhánh này thêm tuỳ chọn **tự động dán** — chọn một mục xong thì ClipFull gửi
`Ctrl + V` tới cửa sổ bạn vừa rời khỏi, thay vì bắt bạn tự bấm.

Mặc định **tắt**. Nhánh này **chưa được merge vào `master`**, và bên dưới là lý do.

## Cách làm

Khi panel ẩn đi, Windows tự trả foreground về cửa sổ trước đó. Chờ ~90ms rồi
spawn PowerShell ẩn để gửi phím:

```
powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -Command
  "$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys('^v')"
```

Không cần native module nào. So với `nut.js` (kéo theo prebuilt binary hàng chục
MB và làm phức tạp hẳn `electron-builder`), đây là đường rẻ hơn rất nhiều — nếu
nó chạy được.

## Đã kiểm chứng được gì

Phần logic, bằng 8 test trong `test/autopaste.test.js`:

- spawn **sau** nhịp chờ chứ không spawn ngay
- `detached` + `windowsHide` + `stdio: 'ignore'`, và `unref()` để tiến trình con
  không giữ ClipFull sống khi người dùng thoát
- tham số PowerShell là hằng số cố định, không ghép chuỗi từ bất kỳ dữ liệu nào
  (nội dung cần dán đã nằm sẵn trên clipboard)
- spawn ném lỗi thì nuốt, không làm sập main process
- ngoài Windows thì no-op

## CHƯA kiểm chứng được gì — và vì sao

Bốn câu hỏi quyết định tính năng này có dùng được hay không, **đều phải chạy app
thật mới trả lời được**:

| Câu hỏi | Rủi ro |
|---|---|
| Tiến trình PowerShell có tự cướp foreground không? | Chỉ cần chớp focus một nhịp là phím gửi nhầm chỗ |
| Phần mềm diệt virus có chặn không? | `SendKeys` qua `WScript.Shell` là mẫu hành vi nhiều bộ diệt virus coi là đáng ngờ |
| Gửi được vào app chạy quyền admin không? | Gần như chắc là **không** — UIPI của Windows chặn tiến trình quyền thấp gửi input cho cửa sổ quyền cao, mà ClipFull không chạy elevated |
| Độ trễ có chấp nhận được không? | Khởi động PowerShell tốn 100–300ms, cộng nhịp chờ |

Không chạy được app vì `npm install` không tải được binary Electron: proxy của
mạng công ty thay chứng chỉ TLS, và bước tải binary từ GitHub báo
`self-signed certificate in certificate chain`. Toàn bộ phần còn lại của dự án
vẫn build và test được (`electron` được thay bằng stub), nhưng thí nghiệm này
thì không — nó chỉ có ý nghĩa khi đo trên máy thật.

## Cách tự kiểm chứng

1. Sửa được lỗi chứng chỉ (trỏ `NODE_EXTRA_CA_CERTS` vào CA gốc của công ty),
   rồi `npm install` lại cho đủ binary Electron.
2. `npm run dev`, vào **Cài đặt → Hành vi → Tự động dán**.
3. Mở Notepad, copy vài thứ, bấm `Ctrl + Alt + V`, chọn một mục.
4. Đo bốn thứ trong bảng trên. Riêng câu hỏi admin: mở Notepad bằng
   "Run as administrator" rồi thử lại.

## Nếu hỏng thì sao

Đừng vá thêm vào cách này. Đường đúng lúc đó là native module (`nut.js` hoặc
addon N-API tự viết): nó nhớ được handle cửa sổ foreground trước khi panel hiện
lên và gửi input đúng cách, thay vì đoán rằng Windows sẽ trả focus về đúng chỗ.

Đổi lại là phá vỡ nguyên tắc zero runtime dependency của dự án — nên chỉ đáng
làm sau khi đã xác nhận cách rẻ này thật sự không dùng được.
