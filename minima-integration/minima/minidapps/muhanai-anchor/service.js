/**
 * MuhanAI Anchor Minidapp Service
 *
 * Anchors content hashes (SHA-256) to Minima chain via MDS.
 *
 * MDS.create pattern:
 *   MDS.create({
 *     script: "RETURN SIGNEDBY(@INPUT 0)",
 *     amount: 0.001,
 *     state: [address, cid, namespace, timestamp, size, path]
 *   })
 */

const crypto = require("crypto");

class AnchorService {
  constructor(mds, config = {}) {
    this.mds = mds;
    this.config = config;
    const m = (config && config.mds) || {};
    this.namespace = m.namespace || "anchor";
    this.pathPrefix = m.pathPrefix || "anchor/";
    this.maxContentSize = m.maxContentSize || 1048576;
    this.defaultAmount = m.defaultAmount || "0.001";
  }

  /**
   * Compute SHA-256 hash of content
   */
  hashContent(content) {
    const data =
      typeof content === "string" ? Buffer.from(content, "utf8") : content;
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  /**
   * Anchor content to Minima chain via MDS
   */
  async anchor(options) {
    const {
      content,
      namespace: nsOpt,
      path: pathOpt,
      address: addrOpt,
      metadata,
    } = options;

    const ns = nsOpt || this.namespace;
    const cid = this.hashContent(content);
    const size = Buffer.isBuffer(content)
      ? content.length
      : Buffer.byteLength(content, "utf8");
    const timestamp = Date.now();
    const finalPath = pathOpt || `${this.pathPrefix}${cid.slice(0, 16)}`;
    const address = addrOpt || this.getDefaultAddress();

    if (size > this.maxContentSize) {
      throw new Error(
        `Content exceeds max size of ${this.maxContentSize} bytes`,
      );
    }

    // MDS.create pattern
    const state = [
      address,
      cid,
      ns,
      timestamp.toString(),
      size.toString(),
      finalPath,
    ];

    const params = {
      script: "RETURN SIGNEDBY(@INPUT 0)",
      amount: this.defaultAmount,
      state: state,
    };

    try {
      const result = await this.mds.create(params);

      return {
        txid: result.txid,
        hash: cid,
        blockHeight: result.blockHeight,
        timestamp: timestamp,
        cid: cid,
        size: size,
        namespace: ns,
        path: finalPath,
        metadata: metadata,
      };
    } catch (error) {
      throw new Error(`Anchor failed: ${error.message}`);
    }
  }

  async anchorString(text, namespace, path) {
    return this.anchor({ content: text, namespace, path });
  }

  async anchorBytes(bytes, namespace, path) {
    return this.anchor({ content: bytes, namespace, path });
  }

  async retrieve(cid, namespace) {
    const ns = namespace || this.namespace;
    return this.mds.retrieve({ cid, namespace: ns });
  }

  async list(namespace, limit = 50, offset = 0) {
    const ns = namespace || this.namespace;
    return this.mds.list({ namespace: ns, limit, offset });
  }

  getDefaultAddress() {
    return process.env.MINIMA_ADDRESS || "unknown";
  }
}

module.exports = { AnchorService };
