# Prompt tạo ổ đạn 8 viên (revolver-8) cho Poker Mode

Prompt dưới đây tạo ảnh **ổ quay 8 buồng** nhìn từ trên, **đối xứng, cân đối**, tương thích với code (8 lỗ đều vòng tròn) và **đồng bộ style** với 4 ảnh: `card-open.png`, `card-closed.png`, `bullet-token.png`, `bullet-token-empty.png`.

---

## Yêu cầu kỹ thuật (để tương thích code)

- **Góc nhìn:** Chính diện từ trên xuống (top-down), trục súng vuông góc với mắt.
- **Số buồng:** Đúng **8 buồng** (8 lỗ tròn) xếp **đều** trên một vòng tròn.
- **Đối xứng:** Hình tròn, tâm rõ ràng; 8 buồng cách đều nhau (mỗi buồng cách nhau 45°).
- **Tỷ lệ:** Ảnh vuông hoặc gần vuông (ví dụ 400×400 px trở lên), ổ đạn nằm gọn trong khung, có chút margin để crop.

---

## Prompt (copy vào Gemini / công cụ tạo ảnh)

Đính kèm 4 ảnh tham chiếu: `card-open.png`, `card-closed.png`, `bullet-token.png`, `bullet-token-empty.png`.

```
Create a single image of a revolver cylinder for a game UI. View: strictly from directly above (orthogonal top-down). Match the style of the 4 reference images.

CRITICAL – number of chambers (previous attempts gave 10 holes; we need exactly 8):
- This cylinder has EXACTLY 8 (eight) bullet chambers — no more, no less. Not 6 (like a typical revolver), not 10. Count them: there must be precisely 8 round holes arranged in one circle.
- Eight holes only, evenly spaced: so 360° ÷ 8 = 45° between each. Positions: 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°. The cylinder has 8-fold rotational symmetry (looks the same when rotated by 45°).

CRITICAL – symmetry:
- The cylinder is a perfect circle centered in the image. No oval, no tilt, no perspective.
- One central circular hub in the middle, concentric with the 8 chamber holes. All circles share the same center.
- Lighting should not break symmetry: use soft or radially even lighting.

Technical:
- Square canvas (e.g. 400×400 px or larger), cylinder centered, transparent background (PNG).
- Each of the 8 chambers is a circular opening; style can match the empty bullet-chamber ring (gold/brass).

Style (match references):
- Metallic: aged brass / golden-brown, satin sheen like the bullet tokens. Soft 3D lighting, optional subtle wear.

Output: One revolver cylinder with exactly 8 chambers, perfectly symmetrical, same mood as the card and bullet assets.
```

---

## Cách dùng

1. Mở Gemini (hoặc công cụ hỗ trợ ảnh tham chiếu).
2. Đính kèm: `card-open.png`, `card-closed.png`, `bullet-token.png`, `bullet-token-empty.png`.
3. Dán nguyên đoạn prompt trên.
4. Lưu ảnh thành `public/assets/img/revolver-8.png`.

Trong code, ảnh được dùng làm nền cho vòng tròn ổ đạn; 8 ô chamber (div) được đặt đè lên đúng vị trí 8 lỗ. Nếu ảnh có 8 lỗ đều và đối xứng, chỉ cần đặt file vào `public/assets/img/revolver-8.png` và trong `src/styles/site.css` đổi class `.poker-cylinder-8` từ `revolver-8.svg` sang `revolver-8.png` (nếu hiện đang dùng SVG).
