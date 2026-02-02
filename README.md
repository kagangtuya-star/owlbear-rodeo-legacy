# Owlbear Rodeo Legacy

本仓库为 Owlbear Rodeo 旧版本代码，仅供自建与学习使用。
官方团队已将主要精力转向 2.0 版本，本仓库不再维护。

## 运行环境
- Node.js 18.x
- Yarn

## 部署与运行

### Docker
在项目根目录执行：
```
docker-compose up
```
注意：Docker 内存建议 ≥ 5GB。

### 手动部署（生产/轻量服务器）

#### 1) 后端（/backend）
```
yarn --cwd backend install
```
```
yarn --cwd backend build
```
```
yarn --cwd backend start
```

#### 2) 前端（根目录）
```
yarn install
```
```
yarn build
```
或者从pages分支下载build好的

启动轻量生产服务器（二选一）：
```
npx serve -s build -l 3000
```
```
node ./node_modules/serve/bin/serve.js -s build -l 3000
```

> 说明：`serve` 需要手动安装（若缺失）。

### （可选）前端开发模式
仅用于本地调试：
```
yarn start
```

## 环境变量

### 前端（根目录 .env.local）
```
REACT_APP_BROKER_URL=http://<后端域名或IP>:9000
```

### 后端（backend/.env 或 backend/.env.local）
```
PORT=9000
STUN_ENABLED=true
STUN_PORT=3478
STUN_BIND_HOST=0.0.0.0
STUN_PUBLIC_HOST=<对外可达的域名或IP>
```

- `STUN_PUBLIC_HOST` 必须是客户端可访问的地址。
- 局域网部署请填写局域网 IP（例如 192.168.x.x）。
- 公网部署需开放 UDP 3478（或你自定义端口）。

## P2P / 资产传输说明
- 资产传输**优先走 P2P（WebRTC DataChannel）**。
- P2P 失败时，客户端会发送失败信号，主机再上传到后端，异常端从后端拉取。
- ICE 配置通过 `/iceservers` 提供，默认读取 `backend/ice.json` 并注入自建 STUN。

### 修改 ICE 服务器
可直接编辑 `backend/ice.json`：
```
{
  "iceServers": [{ "urls": "stun:<你的STUN地址>:3478" }]
}
```

## 常见问题

### 自定义图片在其他设备不可见
- 请确认 `STUN_PUBLIC_HOST` 可访问，并开放 UDP 端口。
- 确认前端 `REACT_APP_BROKER_URL` 指向正确后端。
- 某些浏览器/扩展会禁用 WebRTC（尤其是隐私/广告拦截类）。

## 引用

[byronknoll/visibility-polygon-js: This library can be used to construct a visibility polygon for a set of line segments.](https://github.com/byronknoll/visibility-polygon-js) **高效的多边形光照算法**

## License
本项目仅供个人使用，不提供商业授权。
未经许可，不得进行商业目的的修改、发布或传播。
如需商业授权，请联系官方：contact@owlbear.rodeo

## Contributing
该仓库为历史版本，已关闭 PR。

## Credits
项目由 Nicola 与 Mitch 创建。
