# Cocos Creator 接线文档

适用版本：Cocos Creator 3.8.6 及以上。

代码已经实现完整玩法。由于无法直接操作你当前打开的 Creator 编辑器，需要按本文完成一次场景和预制体绑定。

## 一、脚本清单

| 脚本 | 挂载位置 | 用途 |
| --- | --- | --- |
| `GameController.ts` | 场景中的 `Game` 节点 | 棋盘、拖动、消除、计分、Combo、倒计时、提示、洗牌、结算 |
| `TileView.ts` | 麻将预制体根节点 | 单张麻将显示和触摸输入 |
| `RestartButton.ts` | 胜利、失败面板的重开按钮 | 调用游戏重开 |

脚本目录：`assets/script/`

## 二、设计分辨率

在项目设置中配置：

- Design Resolution：`720 x 1280`
- Fit Height：开启
- Fit Width：按投放平台测试后决定，竖屏优先开启
- 屏幕方向：Portrait

## 三、制作麻将预制体

### 1. 节点结构

```text
Tile                     根节点，尺寸建议 82 x 96
├── FrontBase             Sprite，使用“正.png”，显示白色正面和绿色牌身
├── Face                  Sprite，显示 D001-D018 透明花纹
├── SelectedMark          Sprite，可用 guang.png，默认隐藏
└── HintMark              Sprite，可用 guang.png，默认隐藏
```

### 2. 根节点组件

给 `Tile` 添加：

- `UITransform`
- `TileView`

`TileView` 属性绑定：

| 属性 | 绑定 |
| --- | --- |
| Front Base | `FrontBase` 节点上的 Sprite |
| Face | `Face` 节点上的 Sprite |
| Selected Mark | `SelectedMark` 节点 |
| Hint Mark | `HintMark` 节点 |

建议设置：

- 根节点锚点：`0.5, 0.5`，UITransform 尺寸建议 `84 x 112`
- `FrontBase` SpriteFrame：`assets/textures/麻将牌面/正.png/spriteFrame`
- `FrontBase` Size Mode 必须选择 `CUSTOM`，UITransform 建议 `84 x 114`
- `Face` Size Mode 必须选择 `CUSTOM`，不要使用 RAW 或 TRIMMED
- `Face` UITransform 建议统一设置为 `72 x 72`
- `Face` 建议位置为 `(0, 10)`，让花纹落在白色区域中央
- 节点层级必须是 `FrontBase` 在下、`Face` 在上
- `SelectedMark` 和 `HintMark` 位于 Face 后方
- `SelectedMark`、`HintMark` 初始 Active 均可关闭

`D001-D060.png` 都只是透明花纹，不包含麻将牌底。如果只把 D 系列图片绑定到 Face，
运行时就会出现“只有符号没有白色绿色牌底”的情况。

完成后将根节点拖入 `assets/prefab/`，保存为 `Tile.prefab`。

## 四、主场景节点

创建 `assets/scene/Game.scene`，推荐结构：

```text
Canvas
├── Background
├── Header
│   ├── ScoreTitle
│   ├── ScoreLabel
│   ├── TimeFrame
│   │   ├── TimeProgress
│   │   └── TimeLabel
│   └── ComboRoot
│       └── ComboLabel
├── BoardArea
│   ├── LineLayer
│   ├── BoardRoot
│   └── GuideHand
├── LowTimeWarning
├── VictoryPanel
│   ├── ResultScore
│   └── RestartButton
├── FailPanel
│   ├── ResultScore
│   └── RestartButton
└── Game
```

重要：

- `BoardRoot` 只放运行时生成的麻将，不要把 `LineLayer` 和 `GuideHand` 放进 `BoardRoot`。
- `BoardRoot`、`LineLayer`、`GuideHand` 使用相同锚点和坐标原点。
- 棋盘逻辑尺寸很大，建议把 `BoardArea` 整体缩放到 `0.72 - 0.78`。
- 推荐 `BoardArea` 位置约为 `(0, -80)`，再根据背景微调。

## 五、GameController 绑定

在 `Game` 节点添加 `GameController`。

### 必绑项

| Inspector 属性 | 绑定内容 |
| --- | --- |
| 棋盘根节点 | `BoardArea/BoardRoot` |
| 麻将预制体 | 第三步制作的 `Tile.prefab` |
| 18张牌面 | 按下方顺序拖入 18 个 SpriteFrame |
| 分数文本 | `Header/ScoreLabel` 的 Label |
| 倒计时文本 | `Header/TimeFrame/TimeLabel` 的 Label |
| 胜利界面 | `VictoryPanel` |
| 失败界面 | `FailPanel` |

### 18 张牌面绑定顺序

玩法只依赖索引，同一种索引会成对出现。建议直接使用：

| 索引 | 逻辑名称 | 推荐资源 |
| --- | --- | --- |
| 0 | 扇子 | `D001.png/spriteFrame` |
| 1 | 兰 | `D002.png/spriteFrame` |
| 2 | 梅 | `D003.png/spriteFrame` |
| 3 | 锦鲤 | `D004.png/spriteFrame` |
| 4 | 竹 | `D005.png/spriteFrame` |
| 5 | 灯笼 | `D006/Users/chen/Library/Containers/com.tencent.qq/Data/tmp/QQ_1782362403979.png.png/spriteFrame` |
| 6 | 中国结 | `D007.png/spriteFrame` |
| 7 | 一条 | `D008.png/spriteFrame` |
| 8 | 红脸 | `D009.png/spriteFrame` |
| 9 | 中 | `D010.png/spriteFrame` |
| 10 | 发 | `D011.png/spriteFrame` |
| 11 | 蓝脸 | `D012.png/spriteFrame` |
| 12 | 一饼 | `D013.png/spriteFrame` |
| 13 | 绿叶 | `D014.png/spriteFrame` |
| 14 | 祥云 | `D015.png/spriteFrame` |
| 15 | 菊 | `D016.png/spriteFrame` |
| 16 | 白板 | `D017.png/spriteFrame` |
| 17 | 红花 | `D018.png/spriteFrame` |

资源目录：`assets/textures/麻将牌面/`

注意：应拖入图片展开后的 `spriteFrame` 子资源，不是 Texture2D。

### 推荐绑定项

| Inspector 属性 | 绑定内容 |
| --- | --- |
| 倒计时进度条 | `TimeProgress` 的 ProgressBar |
| Combo根节点 | `ComboRoot` |
| Combo文本 | `ComboLabel` |
| 开局/提示手指 | `GuideHand` |
| 消除连线画笔 | `LineLayer` 的 Graphics |
| 低时间红屏警告 | `LowTimeWarning` |
| 结算分数文本 | 将胜利和失败面板中的结果 Label 都加入数组 |

### 可选表现资源

| Inspector 属性 | 资源要求 |
| --- | --- |
| 浮动分数预制体 | 根节点含 Label，脚本会自动写入 `+分数` |
| 音效播放器 | 任意节点上的 AudioSource |
| 消除音效 | AudioClip |
| 胜利音效 | AudioClip |
| 失败音效 | AudioClip |

没有绑定可选资源时，不影响玩法运行。

### 参数默认值

| 参数 | 默认值 |
| --- | --- |
| 横向格距 | 88 |
| 纵向格距 | 102 |
| 游戏时间 | 300 秒 |
| 无操作提示时间 | 3 秒 |
| 开局自动提示延迟 | 0.8 秒 |

## 六、连线层

给 `LineLayer` 添加：

- `UITransform`，尺寸覆盖棋盘区域
- `Graphics`

建议：

- `LineLayer` 与 `BoardRoot` 同位置、同缩放、同锚点
- 层级放在麻将上方
- Graphics 颜色可设为金色或亮黄色
- 脚本会设置线宽为 9，并自动绘制和清除

## 七、GuideHand

可以使用简单手指图片，也可先使用圆形亮点。

要求：

- `GuideHand` 与 `BoardRoot` 使用相同局部坐标系
- 初始 Active 关闭
- 锚点 `0.5, 0.5`
- 放在麻将和连线上方

脚本会自动：

- 开局寻找可行操作
- 点击提示时做缩放动画
- 拖动提示时从起点移动到目标空格
- 玩家触摸后立即隐藏

## 八、低时间警告

`LowTimeWarning` 可使用半透明红色全屏 Sprite：

- 初始 Active 关闭
- 拉伸铺满 Canvas
- 不要添加 BlockInputEvents

剩余时间小于等于 10 秒时脚本自动显示。

## 九、结算和重开按钮

`VictoryPanel`、`FailPanel` 初始均关闭。

给两个重开按钮分别添加：

1. `Button`
2. `RestartButton`
3. 将场景中的 `GameController` 拖入 `RestartButton.game`
4. Button 的 Click Events 添加当前按钮节点
5. Component 选择 `RestartButton`
6. Handler 选择 `restart`

## 十、运行前检查

1. 场景已保存并设为启动场景。
2. `GameController` 没有红色缺失引用。
3. 18 个牌面全部绑定，数量不能少于 18。
4. Tile 预制体根节点有 `TileView`。
5. Tile 的 Face Sprite 已绑定给 `TileView.face`。
6. BoardRoot 不包含 LineLayer 和 GuideHand。
7. 预览时可点击同排/同列无遮挡的相同牌直接消除。
8. 拖动时只沿主方向移动，并按格吸附。
9. 三秒内连续消除会累计 Combo。
10. 无操作三秒会显示提示；死局会自动洗牌。

## 十一、玩法实现说明

### 连通算法

从目标牌向上、下、左、右逐格检查：

- 空格继续前进。
- 遇到第一张牌停止。
- 第一张牌与起点牌面相同则可消除。
- 第一张牌不同则该方向不可消除。

### 拖动算法

- 首次明显移动后锁定水平或垂直轴。
- 根据拖动方向收集连续牌段。
- 计算该方向连续空格数量。
- 拖动距离限制在空格范围内。
- 松手后四舍五入吸附到整格。
- 检查本次移动牌段是否形成新配对。

### 提示算法

- 优先搜索当前直接可点击消除的牌。
- 若没有，则遍历每张牌的四个拖动方向。
- 逐格模拟合法移动。
- 找到能产生配对的第一步，交给手指动画演示。

### 洗牌算法

- 提示算法找不到任何操作时触发。
- 保留牌的位置和空格，只打乱剩余牌面。
- 洗牌后再次检查可解性。
- 如果仍无解，强制制造一组同排或同列的同类牌。
