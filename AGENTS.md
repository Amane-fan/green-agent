# AGENTS.md

## 语言偏好

* 默认使用中文回答。
* 编写文档、说明和注释时，优先使用中文。
* 代码、命令、配置项等保留英文原文。

## 回答规范

* 回答应简洁、清晰、直接。
* 不确定的信息需明确说明，不编造。
* 修改代码时，说明主要变更和影响范围。

## Git 提交规范

使用 Conventional Commits 格式：

```text
<type>(<scope>): <subject>
```

示例：

```text
feat(auth): 添加登录功能
fix(api): 修复接口空响应问题
docs(readme): 更新使用说明
refactor(user): 简化用户模块逻辑
test(order): 添加订单测试
chore(deps): 更新依赖
```

常用 `type`：

* `feat`：新功能
* `fix`：修复 bug
* `docs`：文档修改
* `style`：格式调整
* `refactor`：代码重构
* `test`：测试相关
* `chore`：杂项维护

要求：

* 提交信息使用中文。
* 一次提交只做一件事。
* 描述应具体，避免 `update`、`fix bug`、`修改代码` 等模糊写法。
