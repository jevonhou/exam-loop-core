<div align="center">
  <h1>Exam Loop Core</h1>
  <p><strong>为 TypeScript 应用提供可组合的学习流程。</strong></p>
  <p>用一套通用核心构建学习回合、间隔复习、阶段检查、补救训练、内容校验和可靠的本地存档。</p>
  <p>
    <a href="README.md">English</a> ·
    <a href="https://github.com/jevonhou/exam-loop-core/actions/workflows/ci.yml">CI</a> ·
    <a href="docs/api.md">API 指南</a> ·
    <a href="CONTRIBUTING.md">参与贡献</a>
  </p>
</div>

Exam Loop Core 是一个不依赖界面框架的 TypeScript 学习核心库，适合采用短回合、即时反馈和持续复习机制的产品。它提供学习闭环所需的状态规则与扩展接口，开发者可以自由选择界面、内容和基础设施。

无论是考公、考法、语言学习、职业认证还是企业培训，都可以在同一套通用能力之上设计自己的题型、反馈方式和学习节奏。

> **项目状态：** `0.1.x` 是早期公开版本。现有 API 已有文档和测试保障，但在 `1.0.0` 之前仍可能演进。软件包可从 GitHub Releases 下载，暂未发布到 npm。

## 能做什么

| 模块       | 提供的能力                                                                  |
| ---------- | --------------------------------------------------------------------------- |
| `learning` | 可复现的学习回合、答案评估适配、部分得分、间隔复习、阶段检查与补救训练      |
| `content`  | 版本化内容包、引用校验、先修关系循环检测、许可信息与安全预览                |
| `storage`  | 数据仓储接口、规范化 JSON、SHA-256 归档、恢复校验，以及写入失败后的状态回滚 |

所有公共 API 都可以从根入口使用，也提供稳定的模块入口：

```ts
import { planSession } from "exam-loop-core";
import { scheduleAttempt } from "exam-loop-core/learning";
import { validateContentPackage } from "exam-loop-core/content";
import { createArchive } from "exam-loop-core/storage";
```

## 如何接入产品

```text
应用
  ├── 界面与交互
  ├── 学习内容与答案适配器
  └── 数据持久化实现
             │
             ▼
       exam-loop-core
  ├── 学习回合与策略
  ├── 内容协议与校验
  └── 存储协议与恢复
```

这个核心库不会读取系统时间、访问 DOM、调用网络服务或指定数据库。时间、随机种子、学习规则、答案适配器和数据仓储都由使用方明确传入，因此同样的输入会得到同样的结果，既方便测试，也便于迁移到不同产品和平台。

## 运行示例

环境要求：Node.js 22 或 24，以及 npm 10 或更高版本。

```bash
git clone https://github.com/jevonhou/exam-loop-core.git
cd exam-loop-core
npm ci
npm run example
```

仓库中的虚构认证示例会完整演示内容包校验、学习回合规划、模拟答案评估、复习安排、阶段检查和学习归档验证。

运行完整的本地质量检查：

```bash
npm run check
```

## 最小复习流程

```ts
import { scheduleAttempt } from "exam-loop-core/learning";

const review = scheduleAttempt(undefined, {
  id: "attempt-1",
  itemId: "item-constitutional-principle",
  skillIds: ["rule-application"],
  outcome: "correct",
  score: 1,
  occurredAt: Date.UTC(2026, 0, 1, 9),
});

console.log(review.step, review.dueAt);
```

复习调度器不会自行读取当前时间。只要状态和作答记录相同，计算结果就保持一致，便于测试、重放和数据迁移。

完整的适配器流程请参阅 [API 指南](docs/api.md)和[可运行示例](examples/fictional-certification/README.md)。

## 设计原则

- **默认可复现。** 时间、随机种子、学习阈值和调度策略都由使用方传入。
- **内容类型由应用掌握。** 核心库校验内容包结构，具体题目数据由应用自己的解析器确认。
- **用适配器连接不同产品。** 题型、答案评估方式和数据存储都可以替换。
- **学习状态可以迁移。** 规范化归档和清晰的仓储接口可用于浏览器、原生应用、本地文件或远程服务。
- **保持较小的依赖面。** 软件包没有运行时依赖。

## 项目范围

Exam Loop Core 专注于可复用的学习流程，不附带用户界面、题库、账号系统、数据分析、支付功能或托管后端。应用可以自行实现这些部分，也可以通过独立的集成包接入。

归档校验和用于检测数据是否被意外修改，不等同于加密或数字签名。接入方仍需自行处理访问控制、隐私、内容授权和考试准确性声明。详情请参阅[安全策略](SECURITY.md)与[内容许可策略](CONTENT_LICENSE_POLICY.md)。

## 文档

- [API 指南](docs/api.md)
- [架构说明](docs/architecture.md)
- [设计决策](docs/design-decisions.md)
- [兼容性](COMPATIBILITY.md)
- [API 稳定性](API_STABILITY.md)
- [安全策略](SECURITY.md)
- [贡献指南](CONTRIBUTING.md)

## 参与贡献

欢迎提交可复现的问题和边界清晰的功能建议。准备 Pull Request 前请先阅读[贡献指南](CONTRIBUTING.md)。安全问题请通过 [GitHub 私密漏洞报告](https://github.com/jevonhou/exam-loop-core/security/advisories/new)提交。

## 许可证

Exam Loop Core 采用 [MIT License](LICENSE)。接入的内容包由各自作者单独授权。
