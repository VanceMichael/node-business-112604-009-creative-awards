# 匿名赛事评审与附条件奖励兑现

这个项目用于匿名赛事评审与附条件奖励兑现的服务端业务。当前可运行内容是合成资料核查和奖励合作方接收端，业务办理接口尚未提供。

运行环境为 Node.js 22.23.4，没有第三方运行依赖。`data/catalog.json` 保存领域资料，`data/records.json` 保存按输入顺序排列的合成记录；这些记录可能包含矛盾或尚待核实的状态。字段说明见 [资料约定](docs/资料约定.md)。

本地准备与核查：
```sh
npm ci --ignore-scripts
npm run check:data
npm test
```
资料核查仅确认格式和必要引用；现有测试仅验证联调接收端的流水语义，不能证明业务办理已经成立。

启动联调接收端：
```sh
npm run peer
```
默认监听本机 4300 端口，状态保存在 `.local/peer-state.json`。可用 `PEER_PORT`、`PEER_HOST`、`PEER_STATE` 覆盖。地址、授权头及控制接口见 [联调协议](docs/联调协议.md)。该进程是外部协作方的本地替身，不是业务服务。

容器运行：
```sh
docker compose up --build -d
docker compose exec peer npm run check:data
docker compose exec peer npm test
docker compose down
```
卷保存联调端流水，停止和重启容器不清除它。独立环境核查时可用 `docker run --rm` 在隔离容器内运行 `npm test`，临时目录会由测试自行清理。所有人物、证件、账户和业务编号均为合成值；不需要真实系统账号。
