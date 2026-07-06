# Qwen Image 3.0 API 调用指南

## 可用模型（Only for 接口调试，不代表最终效果）

| 模型名 | 场景 | 说明 |
| --- | --- | --- |
| `pre-qwen-image-3-preprocess-0706` | 文生图 (T2I) / 图生图 (I2I) | 统一模型，服务端根据请求内容自动路由 |

## 接口地址

```plaintext
POST https://poc-dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation

```

## 请求头

| Header | 值 |
| --- | --- |
| `Content-Type` | `application/json` |
| `Authorization` | `Bearer {API_KEY}` |

---

## 一、文生图 (T2I)

仅需提供文本 prompt，由模型生成图片。

### 请求示例

```bash
curl --location 'https://poc-dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
--header 'Authorization: Bearer sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' \
--header 'Content-Type: application/json' \
--data '{
    "model": "pre-qwen-image3-rewrite-preprocess",
    "input": {
      "messages": [
        {
          "role": "user",
          "content": [
            {
              "text": "画面是一张竖幅户外人像摄影，整体从上到下呈现温暖的午后街景氛围。顶部左侧到上方大面积被深绿色藤蔓和橙色小花覆盖，花叶从建筑檐口自然垂落，受阳光照射的叶片呈黄绿色高光，阴影处则偏深绿，形成浓密而柔和的背景层次。左上至中上区域是一块深蓝色横向招牌，招牌表面较暗、略带磨砂质感，上面以白色哥特体大字写着“Il Messaggero”，文字位于画面左侧偏上，部分被前景花叶轻微遮挡，字体高对比、带装饰性尖角和粗细变化。招牌下方是报刊亭或书报摊的玻璃展示窗，黑色金属框架将橱窗分隔成多个矩形区域，内部陈列着许多报纸、杂志和书刊封面，但大多因景深虚化和光线反射而难以辨读，形成浅色纸张与深色边框交错的背景纹理。画面右上方是强烈的逆光区域，阳光从街道尽头照入，背景建筑被虚化成米灰色块面，边缘柔和，呈现明显的浅景深效果。画面中部偏右是一名年轻成年女性的半身至膝上人像，她回头面向镜头微笑，身体略向右转，肩背朝向观者，姿态自然放松。她有长而浓密的黑色波浪卷发，发丝被逆光勾勒出金色轮廓光，发梢在右侧向外散开，显得轻盈蓬松。她肤色白皙，脸型柔和偏鹅蛋形，眉形细致，眼睛明亮，眼妆清透，睫毛明显，面部带有自然高光，唇部为柔和珊瑚红色，笑容露齿，表情亲切明朗。她佩戴小巧耳饰，身穿黑色细肩带露背连衣裙，面料颜色深黑、轮廓简洁，细肩带从肩部向背部延伸，背部线条清晰。画面下部偏左到中部，她双手抱着一束玫瑰花，花束体积较大，主要由橙色、杏色、粉色和浅桃色玫瑰组成，花瓣层层卷曲，边缘被阳光照亮，绿色叶片和长花茎从花束下方垂出，花束与黑色裙装形成鲜明色彩对比。右侧背景是一条被阳光照亮的城市街道，地面呈暖灰与金黄色调，远处建筑、街边设施和一个模糊的红色圆形交通标志位于右下远景，均因焦外虚化而只保留色块和轮廓。整张照片采用暖色胶片感处理，带有细腻颗粒、柔和对比和明显逆光边缘光，人物位于视觉焦点，背景报刊亭、花藤、街道和阳光共同营造出浪漫、明亮、都市漫步式的氛围。"
            }
          ]
        }
      ]
    },
    "parameters": {
        "prompt_extend": true,
        "debug": true
    }
  }'
```

### content 结构

```json
"content": [
  {"text": "你的提示词"}
]

```

仅包含一个 `text` 对象。

---

## 二、图生图 / 图像编辑 (I2I)

提供 1-3 张参考图 + 文本 prompt，生成编辑后的图片。

### 请求示例

```bash
curl --location 'https://poc-dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' \
--header 'Authorization: Bearer sk-xxxxxxxxx' \
--header 'Content-Type: application/json' \
--data '{
    "model": "xxxxx",
    "input": {
      "messages": [
        {
          "role": "user",
          "content": [
            {
              "image": "https://alidocs.oss-cn-zhangjiakou.aliyuncs.com/res/yBRq1ZPYEaXdyOdv/img/33a80a19-7ac7-4c64-b0fa-7d685b7046a0.png"
            },
            {
              "text": "帮我生成一张充满高级感的都市风格女性写真，画面中人物完美保留输入图片中这位年轻女性的面部特征与一头柔顺的黑色长发。人物脱下原本的米色针织上衣，换上一套彰显高雅气质的都市职场穿搭，身穿一件质感垂顺的香槟色真丝衬衫，外搭一件剪裁利落的深灰色休闲西装外套，下身搭配同色系的高腰阔腿裤，整体造型既干练又富有女人味。场景设定在一家装修现代简约的高端咖啡店内，背景是通透的落地玻璃窗，窗外隐约可见繁华的城市街景，室内摆放着深色实木长桌和舒适的皮质座椅，桌面上放置着一台打开的银色笔记本电脑、一份文件和一杯热气腾腾的美式咖啡。人物呈现出慵懒而放松的办公姿态，身体微微后仰倚靠在椅背上，一只手臂自然搭在扶手上，另一只手轻轻握着咖啡杯置于桌边，头部微侧，眼神清澈从容且带有一丝慵懒地直视镜头，嘴角挂着一抹优雅自信的微笑。人物化着精致得体的正式场合妆容，底妆清透干净，眉眼线条清晰利落，唇部涂抹着显气色的豆沙色口红，展现出成熟知性的魅力。光线采用午后柔和的自然光，从侧面透过落地窗洒入，在人物的面部轮廓和衣物褶皱上留下细腻的光影过渡，背景呈现自然的景深虚化效果，色彩以大地色、灰色和暖白色为主调，营造出宁静、高级且充满故事感的都市办公氛围，构图采用经典的竖幅七分身人像视角，人物位于画面视觉中心略偏右，比例协调，画质清晰细腻。"
            }
          ]
        }
      ]
    },
    "parameters": {
        "prompt_extend": true,
        "debug": true
    }
  }'
```

### content 结构

```json
"content": [
  {"image": "图片URL_1"},
  {"image": "图片URL_2"},
  {"text": "你的编辑指令"}
]

```

*   支持 1-3 张输入图，按数组顺序定义图片顺序
    
*   图片格式：公网 URL (HTTP/HTTPS)、OSS 临时 URL、Base64 (`data:{mime};base64,{data}`)
    
*   建议图片尺寸 384~2048像素，文件不超过 10MB
    

---

## 三、parameters 参数说明

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `prompt_extend` | boolean | `true` (建议) | 是否开启提示词智能改写 |
| `prompt_extend_mode` | string | `"direct"` | 改写方式：`"direct"` 或 `"agent"` |
| `n` | integer | `1` | 输出图片数量 |
| `size` | string | 自动 | 输出分辨率，格式 `宽*高`，如 `"2048*2048"`。T2I 未指定时由模型自动决定 |
| `negative_prompt` | string | \- | 反向提示词，描述不希望出现的内容 |
| `seed` | integer | \- | 随机种子，范围 `[0, 2147483647]`，固定种子可复现结果 |
| `watermark` | boolean | `false` | 是否添加水印 |

### 分辨率规则

*   **T2I** 输出宽高为 **16 的倍数**
    
*   **I2I/edit** 输出宽高为 **32 的倍数**
    
*   T2I 模式下若不指定 `size`，模型会根据 prompt 自动推荐分辨率
    

---

## 四、响应格式

### 成功响应

```json
{
  "output": {
    "choices": [
      {
        "finish_reason": "stop",
        "message": {
          "role": "assistant",
          "content": [
            {
              "image": "https://dashscope-result.example.com/xxx.png?Expires=xxx"
            }
          ]
        }
      }
    ]
  },
  "usage": {
    "input_tokens": 120,
    "output_tokens": 837400,
    "width": 1696,
    "height": 2528,
    "image_count": 1,
    "input_tokens_details": {
      "text_tokens": 120,
      "image_tokens": 0
    },
    "rewrite_tokens_details": {
      "input_tokens": 2120,
      "output_tokens": 800
    }
  },
  "request_id": "571ae02f-5c9d-436c-83c2-f221e6df0xxx"
}

```

*   `output.choices[].message.content[].image`：生成图片 URL，有效期约 **24 小时**，请及时下载保存
    
*   `usage`：token 用量统计（详见下方）
    

### usage 字段说明

| 字段 | 说明 |
| --- | --- |
| `input_tokens` | 推理输入 token = text\_tokens + image\_tokens |
| `output_tokens` | 输出图片 token（像素面积 / 256 \* 推理步数） |
| `input_tokens_details.text_tokens` | 文本 prompt 的 token 数 |
| `input_tokens_details.image_tokens` | 输入图片 token 数（T2I 为 0） |
| `rewrite_tokens_details` | 提示词改写链路消耗的 token（独立计算，不含在 input/output\_tokens 中） |

### 失败响应

```json
{
  "request_id": "31f808fd-8eef-9004-xxxxx",
  "code": "InvalidApiKey",
  "message": "Invalid API-key provided."
}

```
---

## 五、快速对照

| 我想要... | model | content 中放什么 |
| --- | --- | --- |
| 用文字生成图片 | `pre-qwen-image-3-preprocess-0706` | `[{"text": "..."}]` |
| 用图片+指令编辑 | `pre-qwen-image-3-preprocess-0706` | `[{"image": "..."}, {"text": "..."}]` |
| 多图参考编辑 | `pre-qwen-image-3-preprocess-0706` | `[{"image": "..."}, {"image": "..."}, {"text": "..."}]` |