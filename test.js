import crypto from "crypto";

const computeBlockHash = ({ index, previousHash, timestamp, data, nonce }) => {
  return computeHash(
    index,
    previousHash,
    timestamp,
    JSON.stringify(data),
    nonce
  );
};

const computeHash = (index, previousHash, timestamp, data, nonce) => {
  return crypto
    .createHash("sha256")
    .update(index + previousHash + timestamp + JSON.stringify(data) + nonce)
    .digest("hex");
};

const block = {
  index: 1,
  timestamp: 1710832293426,
  nonce: 84710,
  previousHash: "00000aa1fbf27775ab79612bcb8171b3a9e02efe32fa628450ba6e729cf03996",
  hash: "000081c71e7ed7eb8c3a8cbe547e1ab6d4246d486c97b9a1f3bb791011511a82",
  data: [],
};

console.log(computeBlockHash(block));
console.log(computeBlockHash(block));
