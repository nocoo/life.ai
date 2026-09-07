# Life.ai 图标规范

保留水豚的焦糖色碎片、闭眼表情、蓝紫镜框与头顶苹果。短颈与肩部自然延伸至左下画框，完整保留耳朵、镜框和叶片。独立的 Riverbank ripples 底纹以水岸涟漪和叶脉构成。

## 使用场景

| 场景 | 资源 | 处理 |
| --- | --- | --- |
| README 页头 | `assets/brand/icon-rounded.png` | 128 px 圆角背景展示图 |
| 侧栏与小型页头 | `dashboard/public/logo-{24,80}.png` | 透明前景；展开与折叠侧栏均无额外裁切 |
| 登录页 | `dashboard/public/logo-192.png` | 透明前景，以 96 CSS px 展示；移除圆形遮罩与白色滤镜 |
| 浏览器 | `dashboard/src/app/icon.png`, `favicon.ico` | 透明 32 px PNG、16/32 px ICO，由 Next 文件元数据加载 |
| Apple touch | `dashboard/src/app/apple-icon.png` | 180 px 不透明方形展示图，由平台处理圆角 |
| 社交预览 | `dashboard/src/app/opengraph-image.png` | 圆角展示图置于原有 1200 × 630 深色底面 |

根目录 `logo.png` 是 2048 × 2048 透明前景；`assets/brand/icon.png` 与 `icon-rounded.png` 分别是方形和圆角展示版本。小型侧栏、页头和 favicon 使用透明前景，不增加底色、滤镜或圆形遮罩。登录页的 192 px 源文件用于界面展示，不是 PWA 图标。

## 再生成与来源

```sh
uv run --with pillow python scripts/resize-logos.py
```

本次使用一次 Azure gpt-image-2 生成，原生 2048 × 2048；选用 `2026-09-07-01 / 02`。五官与完整配饰对实际 23% 圆角轮廓的最小余量为 239.5 px，肩部的有意出血单独记录。前景、底纹与阴影独立保存，界面主题色保持独立。

[source.json](source.json) 保存精确 SHA-256；完整原图、提示词、抠图、各尺寸、前后对比与测量记录保存在 [Hexly 存档](https://github.com/nocoo/hexly.ai/tree/main/artwork/logo-family/life-ai/2026-09-07-01)。

- [单独展示页](https://hexly.ai/logos/life-ai)
- [本地静态审核页](https://index.dev.hexly.ai/artwork/logo-family/life-ai/2026-09-07-01/review.html)
- [通用使用 SOP](https://github.com/nocoo/hexly.ai/blob/main/docs/07-logo-usage-sop.md)
