import dgram from "dgram";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const peers = []; // 存储对等节点的地址信息
const port = process.argv[2]; // 从命令行参数获取端口号
const host = "127.0.0.1";

// 创建一个 UDP socket
const socket = dgram.createSocket("udp4");

socket.bind(port || 0, host);

socket.on("listening", () => {
  const address = socket.address();
  console.log(`节点正在监听 ${address.address}:${address.port}`);
});

socket.on("message", (msg, rinfo) => {
  console.log(`收到消息: ${msg} 来自 ${rinfo.address}:${rinfo.port}`);
});

// 发送消息到对等节点
function sendMessage(message, peer) {
  socket.send(message, 0, message.length, peer.port, peer.host, (err) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(`消息发送到 ${peer.host}:${peer.port}`);
  });
}

// 从命令行读取命令
rl.on("line", (input) => {
  if (input.startsWith("connect ")) {
    const [_, peerHost, peerPort] = input.split(" ");
    peers.push({ host: peerHost, port: peerPort });
    console.log(`连接到新节点 ${peerHost}:${peerPort}`);
  } else if (input.startsWith("send ")) {
    const message = input.split(" ").slice(1).join(" ");
    peers.forEach((peer) => {
      sendMessage(Buffer.from(message), peer);
    });
  } else {
    console.log("未知命令");
  }
});
