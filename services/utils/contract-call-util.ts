import { AbiCoder, Interface } from "ethers";

const iface = new Interface([
  "event Announce(address indexed announcer, bytes indexed keyHash, bytes key, bytes value)"
]);

const EVENT_SIG_ANNOUNCE = iface.getEvent("Announce")!.topicHash;

export function decodeAnnounce(event: any) {
  const { topics = [], data = "0x" } = event;

  if (
    topics[0] === EVENT_SIG_ANNOUNCE &&
    topics.length === 3 &&
    data.length > 2
  ) {
    const parameters = AbiCoder.defaultAbiCoder().decode(
      ["bytes", "bytes"],
      data
    );

    return {
      ...event,
      announcer: `0x${topics[1].slice(-40)}`,
      keyHash: topics[2],
      key: Buffer.from(parameters["0"].substring(2), "hex"),
      value: parameters["1"] ? Buffer.from(parameters["1"].substring(2), "hex") : ""
    };
  }

  return null;
}
