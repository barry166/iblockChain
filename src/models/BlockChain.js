import crypto from "crypto";
import dgram from "dgram";
import readline from "readline";
import { sign, verifySignature, keys } from "./rsa.js";
import { isEqualObj } from "../utils.js";

const defaultPort = "8888";
class BlockChain {
  constructor() {
    this.data = []; // 还没打包的交易数据
    this.difficulty = 4; // 难度值
    this.blockChain = [BlockChain.initialBlock];
    this.peers = [];
    // 种子节点
    this.seed = { address: "127.0.0.1", port: defaultPort };
    this.udp = dgram.createSocket("udp4");
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    this.init();
  }

  init() {
    this.bindP2P();
    this.bindEvent();
  }

  bindP2P() {
    this.udp.on("message", (message, rinfo) => {
      // rinfo：远程节点数据
      const { type, data } = JSON.parse(message);
      if (type) {
        this.dispatch({ type, data }, rinfo);
      }
    });

    this.udp.on("listening", () => {
      const address = this.udp.address();
      console.log(`节点正在监听 ${address.address}:${address.port}`);
    });

    const port = process.argv[2];
    this.startNode(port);
  }

  bindEvent() {
    this.rl.on("line", (input) => {
      const command = input.split(" ")[0];
      switch (command) {
        case "send":
          const message = input.split(" ").slice(1).join(" ");
          this.boardcast({ type: "chat", data: JSON.stringify(message) });
          break;
        case "peers":
          console.log(this.peers);
          break;
        case "blockchain":
          console.log(this.blockChain);
          break;
        case "peers":
          console.log(this.peers);
          break;
        case "mine":
          this.mine();
          break;
        case "trans":
          const args = input.split(" ");
          this.transfer(...args);
          break;
        case "pending":
          console.log(this.data);
          break;
        case "verifyChain":
          this.validateChain();
          break;
        default:
          console.log("未知命令");
      }
    });
    process.on("exit", () => {
      console.log("退出进程");
    });
  }

  send(message, port, host) {
    this.udp.send(JSON.stringify(message), port, host, (err) => {
      if (err) {
        console.log(`发送消息到 ${host}:${port} 失败：`, err);
      }
    });
  }

  boardcast(message) {
    this.peers.forEach((peer) => {
      this.send(message, peer.port, peer.address);
    });
  }

  startNode(port) {
    this.udp.bind(port || 0);
    if (port !== defaultPort) {
      // 告诉种子节点，由种子节点处理中转事务
      this.send(
        {
          type: "newpeer",
        },
        this.seed.port,
        this.seed.address
      );
      this.peers.push(this.seed);
    }
  }

  dispatch(action, rinfo) {
    switch (action.type) {
      case "newpeer":
        // 通过种子节点中转处理所有节点的连接请求
        console.log(`连接到新节点 ${rinfo.address}:${rinfo.port}`);
        // 告诉除了当前节点其他节点有新朋友来了
        this.boardcast({ type: "sayhi", data: rinfo });
        // 告诉远程节点同步peerlist和blockchain
        this.send(
          {
            type: "peerlist",
            data: {
              peers: this.peers,
            },
          },
          rinfo.port,
          rinfo.address
        );
        this.send(
          {
            type: "blockchain",
            data: JSON.stringify({
              blockchain: this.blockChain,
              trans: this.data,
            }),
          },
          rinfo.port,
          rinfo.address
        );

        this.peers.push(rinfo);
        break;
      case "sayhi":
        // 给别人一个hi
        let data = action.data;
        this.peers.push(data);
        // 和新加入节点打个招呼
        console.log(
          "[信息]: 听说新朋友来了，打个招呼，相识就是缘",
          data.port,
          data.address
        );

        this.send({ type: "hi" }, data.port, data.address);
        break;
      case "blockchain":
        // 本地获取到最新的区块链
        let allData = JSON.parse(action.data);
        let newChain = allData.blockchain;
        let newTrans = allData.trans;

        console.log("[信息]: 更新本地区块链", newChain);
        this.replaceTrans(newTrans);
        if (newChain.length > 1) {
          // 只有创始区块 不需要更新
          this.replaceChain(newChain);
        }
        break;
      case "peerlist":
        // 本地获取到 所有节点，hi一下新朋友
        const newPeers = action.data.peers;
        this.addPeers(newPeers);
        this.boardcast({ type: "hi" });
        break;
      case "hi":
        // hi没有意义，udp打洞给网件加白名单用的
        break;
      case "mine":
        console.log(`有人挖矿成功了🎆`);
        // 验证区块是否合法
        const newBlock = action.data;
        const lastBlock = this.blockChain[this.blockChain.length - 1];
        if (lastBlock.hash === newBlock.hash) {
          return;
        }
        const isValid = this.validateBlock(
          newBlock,
          this.blockChain[this.blockChain.length - 1]
        );
        if (isValid) {
          this.blockChain.push(newBlock);
          this.data = [];
          console.log("更新挖矿后的区块链");
          this.boardcast({ type: "mine", data: action.data });
        } else {
          console.log("挖矿的区块不合法");
        }
        break;
      case "trans":
        // 网络上的交易请求 传给本地区块链
        if (!this.data.find((v) => isEqualObj(v, action.data))) {
          console.log("[信息]: 交易合法 新增一下", action.data);

          this.addTrans(action.data);
          this.boardcast({ type: "trans", data: action.data });
        }
        break;
      case "chat":
        console.log(`==> ${action.data}`);
        break;
      default:
        console.log("未知action", action);
    }
  }

  addPeers(newPeers) {
    newPeers.forEach((peer) => {
      if (!this.peers.find((v) => isEqualObj(v, peer))) {
        this.peers.push(peer);
      }
    });
  }

  addTrans(trans) {
    if (this.isValidTransfer(trans)) {
      this.data.push(trans);
    }
  }

  // 挖矿
  mine(address = keys.publicKey) {
    if (
      !this.data.every((v, index) => {
        const res = this.isValidTransfer(v);
        // console.log(`第${index}笔交易是否合法：${res}`);
        return res;
      })
    ) {
      console.log("有不合法的交易");
      return;
    }
    // 交易数据需要在前面，这样才会打包校验hash
    this.transfer("0", address, 100);

    const startTime = new Date().getTime();
    const newBlock = this.createBlock();
    console.log("newBlock", newBlock);
    if (!this.validateBlock(newBlock)) {
      console.log("不合法的区块或链");
      return false;
    }
    this.blockChain.push(newBlock);
    this.data = [];
    const endTime = new Date().getTime();
    console.log(
      `挖矿成功，耗时${endTime - startTime}ms，算了${newBlock.nonce}次，进账100`
    );
    this.boardcast({ type: "mine", data: newBlock });
    return newBlock;
  }

  // 转账
  transfer(from, to, amount) {
    console.log(from, to, amount);
    const timestamp = new Date().getTime();
    const trans = { from, to, amount, timestamp };
    const signTrans = { ...trans, trans, sign: sign(trans) };
    if (from !== "0") {
      if (this.balance(from) < amount) {
        console.log("余额不足");
        return false;
      }
      this.boardcast({ type: "trans", data: signTrans });
    }
    this.data.push(signTrans);
    return signTrans;
  }

  // 是否是合法转账
  isValidTransfer(signTrans) {
    return signTrans.from === "0"
      ? true
      : verifySignature(signTrans.trans, signTrans.sign, keys.publicKey);
  }

  computeBlockHash({ index, previousHash, timestamp, data, nonce }) {
    return this.computeHash(index, previousHash, timestamp, data, nonce);
  }

  // 计算哈希
  computeHash(index, previousHash, timestamp, data, nonce) {
    return crypto
      .createHash("sha256")
      .update(index + previousHash + timestamp + JSON.stringify(data) + nonce)
      .digest("hex");
  }

  // 创建新区块
  createBlock() {
    let timestamp = new Date().getTime();
    let nonce = 0;
    const previousHash = this.blockChain[this.blockChain.length - 1].hash;
    const index = this.blockChain.length;
    const data = this.data;
    let hash = this.computeHash(index, previousHash, timestamp, data, nonce);
    while (hash.substring(0, this.difficulty) !== "0".repeat(this.difficulty)) {
      nonce++;
      timestamp = new Date().getTime();
      hash = this.computeHash(index, previousHash, timestamp, data, nonce);
    }

    return {
      index,
      timestamp,
      nonce,
      previousHash,
      hash,
      data,
    };
  }

  // 余额
  balance(address = keys.publicKey) {
    let balance = 0;
    for (const block of this.blockChain) {
      if (!Array.isArray(block.data)) continue;
      for (const trans of block.data) {
        if (trans.from === address) {
          balance -= trans.amount;
        }
        if (trans.to === address) {
          balance += trans.amount;
        }
      }
    }
    return balance;
  }

  // 校验区块
  validateBlock(
    block,
    lastBlock = this.blockChain[this.blockChain.length - 1]
  ) {
    if (lastBlock.index + 1 !== block.index) {
      console.log(`第${block.index}块区块索引不正确`);
      return false;
    } else if (lastBlock.timestamp > block.timestamp) {
      console.log(`第${block.index}块区块时间戳不正确`);
      return false;
    } else if (lastBlock.hash !== block.previousHash) {
      console.log(`第${block.index}块区块哈希指向不正确`);
      return false;
    } else if (block.hash !== this.computeBlockHash(block)) {
      console.log(
        "block.hash",
        block.hash,
        block,
        "computeBlockHash",
        this.computeBlockHash(block)
      );
      // 校验区块哈希计算是否正确
      console.log(`第${block.index}块区块哈希整体计算不正确`);
      return false;
    } else if (
      block.hash.substring(0, this.difficulty) !== "0".repeat(this.difficulty)
    ) {
      console.log(`第${block.index}块区块哈希格式计算不正确`);
      return false;
    }
    return true;
  }

  // 校验链
  validateChain(chain = this.blockChain) {
    if (JSON.stringify(chain[0]) !== JSON.stringify(BlockChain.initialBlock)) {
      console.log("创世区块不合法");
      return false;
    }
    for (let i = 1; i < chain.length; i++) {
      const currentBlock = chain[i];
      const previousBlock = chain[i - 1];
      if (!this.validateBlock(currentBlock, previousBlock)) {
        return false;
      }
    }
    return true;
  }

  isValidTrans(trans) {
    return trans.every((v) => this.isValidTransfer(v));
  }

  replaceTrans(trans) {
    if (this.isValidTrans(trans)) {
      this.data = trans;
    }
  }

  replaceChain(newChain) {
    if (newChain.length === 1) {
      return;
    }
    if (
      this.validateChain(newChain) &&
      newChain.length > this.blockChain.length
    ) {
      this.blockchain = JSON.parse(JSON.stringify(newChain));
    } else {
      console.log(`[错误]: 区块链数据不合法`);
    }
  }

  static get initialBlock() {
    return {
      index: 0,
      previousHash: "0",
      data: "Welcome to Block Chain",
      hash: "00000aa1fbf27775ab79612bcb8171b3a9e02efe32fa628450ba6e729cf03996",
      timestamp: 1710649178570,
      nonce: 0,
    };
  }
}

export default BlockChain;
