import {
  generateKeyPairSync,
  publicEncrypt,
  privateDecrypt,
  createSign,
  createVerify,
} from "crypto";
import { writeFileSync, readFileSync, existsSync } from "fs";

// 生成密钥对并以JSON格式存储到文件
function generateAndStoreKeyPairAsBase64() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });

  // 导出为 DER 格式并转换为 Base64 编码字符串
  const publicKeyDer = publicKey.export({ type: "spki", format: "der" });
  const privateKeyDer = privateKey.export({ type: "pkcs8", format: "der" });
  const publicKeyBase64 = Buffer.from(publicKeyDer).toString("base64");
  const privateKeyBase64 = Buffer.from(privateKeyDer).toString("base64");

  const wallet = {
    publicKey: publicKeyBase64,
    privateKey: privateKeyBase64,
  };

  writeFileSync("wallet.json", JSON.stringify(wallet, null, 2));
  return wallet;
}

// 验证密钥对是否合法
function isValidKeyPair(publicKeyStr, privateKeyStr) {
  try {
    const message = "test message";
    // 需要将 Base64 字符串转换回 DER 格式的 Buffer
    const publicKeyDer = Buffer.from(publicKeyStr, "base64");
    const privateKeyDer = Buffer.from(privateKeyStr, "base64");
    const encrypted = publicEncrypt(
      { key: publicKeyDer, format: "der", type: "spki" },
      Buffer.from(message)
    );
    const decrypted = privateDecrypt(
      { key: privateKeyDer, format: "der", type: "pkcs8" },
      encrypted
    );
    return decrypted.toString() === message;
  } catch (error) {
    return false;
  }
}

// 主函数：尝试获取密钥对，验证并处理
function getOrCreateKeyPair() {
  // 检查密钥文件是否存在
  let wallet;
  if (existsSync("wallet.json")) {
    const walletJson = readFileSync("wallet.json", { encoding: "utf8" });
    wallet = JSON.parse(walletJson);
    const publicKeyStr = wallet.publicKey;
    const privateKeyStr = wallet.privateKey;

    if (isValidKeyPair(publicKeyStr, privateKeyStr)) {
      // console.log("从 wallet.json 加载公私钥对，并且它们是合法的。");
    } else {
      console.log("公私钥对不合法，正在生成并存储新的密钥对。");
      wallet = generateAndStoreKeyPairAsBase64();
    }
  } else {
    console.log("wallet.json 不存在，正在生成并存储新的密钥对。");
    wallet = generateAndStoreKeyPairAsBase64();
  }
  return wallet;
}

// 签名数据
function sign(data, privateKeyStr = keys.privateKey) {
  // 将 Base64 编码的私钥字符串转换为 Buffer
  const privateKeyDer = Buffer.from(privateKeyStr, "base64");

  // 创建签名对象并指定签名算法，例如 SHA-256
  const sign = createSign("SHA256");
  sign.update(JSON.stringify(data));
  sign.end();

  // 使用私钥进行签名，并将签名结果以 Base64 格式返回
  const signature = sign.sign({
    key: privateKeyDer,
    format: "der",
    type: "pkcs8",
  });
  return signature.toString("base64");
}

// 验证签名
function verifySignature(data, signature, publicKeyStr) {
  // 将 Base64 编码的公钥字符串转换为 Buffer
  const publicKeyDer = Buffer.from(publicKeyStr, "base64");

  // 创建验证对象并指定签名算法，同样使用 SHA-256
  const verify = createVerify("SHA256");
  verify.update(JSON.stringify(data));
  verify.end();

  // 使用公钥验证签名，返回验证结果
  const isVerified = verify.verify(
    { key: publicKeyDer, format: "der", type: "spki" },
    Buffer.from(signature, "base64")
  );
  return isVerified;
}

// 示例用法
function demonstrateSignature() {
  const data = { from: "Hello, world!", to: "aaa", amount: 100 }; // 待签名的数据
  if (existsSync("wallet.json")) {
    const walletJson = readFileSync("wallet.json", { encoding: "utf8" });
    const wallet = JSON.parse(walletJson);

    // 使用私钥对数据进行签名
    const signature = sign(data, wallet.privateKey);

    // 使用公钥验证签名
    const isVerified = verifySignature(data, signature, wallet.publicKey);

    console.log("Signature:", signature);
    console.log("Verification result:", isVerified ? "Valid" : "Invalid");
  } else {
    console.log("wallet.json 不存在，请先生成密钥对。");
  }
}

// 运行主函数
const keys = getOrCreateKeyPair();
// demonstrateSignature();

export { sign, verifySignature, keys };
