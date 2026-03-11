import { TimedCounter, TimedCounterConfig } from "./timedCounter";
import chai from "chai";

const TEST_TIMED_COUNTER_CONFIG: TimedCounterConfig = {
  threshold: 60 * 1000, // 1min（ms）
  remind: 5 * 60 * 1000 // 5min（ms）
};

describe("TimedCounter", () => {
  it("should process continuous success", () => {
    const counter = new TimedCounter(TEST_TIMED_COUNTER_CONFIG);
    const now = new Date();

    const [recovered, elapsed] = (counter as any).onSuccessAt(
      new Date(now.getTime() + TEST_TIMED_COUNTER_CONFIG.threshold + 1)
    );

    chai.expect(recovered).to.be.false;
    chai.expect(elapsed).to.equal(0);
  });

  it("should process failed in short time", () => {
    const counter = new TimedCounter(TEST_TIMED_COUNTER_CONFIG);
    const now = new Date();

    // first failure
    let [unhealthy, unrecovered, elapsed] = (counter as any).onFailureAt(now);
    chai.expect(unhealthy).to.be.false;
    chai.expect(unrecovered).to.be.false;
    chai.expect(elapsed).to.equal(0);

    // continuous failure in short time
    [unhealthy, unrecovered, elapsed] = (counter as any).onFailureAt(
      new Date(now.getTime() + TEST_TIMED_COUNTER_CONFIG.threshold - 2)
    );
    chai.expect(unhealthy).to.be.false;
    chai.expect(unrecovered).to.be.false;
    chai.expect(elapsed).to.equal(TEST_TIMED_COUNTER_CONFIG.threshold - 2);

    // recovered
    const [recovered, recoveredElapsed] = (counter as any).onSuccessAt(
      new Date(now.getTime() + TEST_TIMED_COUNTER_CONFIG.threshold - 1)
    );
    chai.expect(recovered).to.be.false;
    chai.expect(recoveredElapsed).to.equal(TEST_TIMED_COUNTER_CONFIG.threshold - 1);
  });

  it("should process threshold", () => {
    const counter = new TimedCounter(TEST_TIMED_COUNTER_CONFIG);
    const now = new Date();

    // first failure
    (counter as any).onFailureAt(now);

    // continuous failure in short time
    (counter as any).onFailureAt(
      new Date(now.getTime() + TEST_TIMED_COUNTER_CONFIG.threshold - 1)
    );

    // continuous failure in long time
    const [unhealthy, unrecovered, elapsed] = (counter as any).onFailureAt(
      new Date(now.getTime() + TEST_TIMED_COUNTER_CONFIG.threshold + 1)
    );
    chai.expect(unhealthy).to.be.true;
    chai.expect(unrecovered).to.be.false;
    chai.expect(elapsed).to.equal(TEST_TIMED_COUNTER_CONFIG.threshold + 1);

    // recovered
    const [recovered, recoveredElapsed] = (counter as any).onSuccessAt(
      new Date(now.getTime() + TEST_TIMED_COUNTER_CONFIG.threshold + 2)
    );
    chai.expect(recovered).to.be.true;
    chai.expect(recoveredElapsed).to.equal(TEST_TIMED_COUNTER_CONFIG.threshold + 2);
  });

  it("should process remind", () => {
    const counter = new TimedCounter(TEST_TIMED_COUNTER_CONFIG);
    const now = new Date();

    // first failure
    (counter as any).onFailureAt(now);

    // continuous failure in short time
    (counter as any).onFailureAt(
      new Date(now.getTime() + TEST_TIMED_COUNTER_CONFIG.threshold - 1)
    );

    // continuous failure in long time
    (counter as any).onFailureAt(
      new Date(now.getTime() + TEST_TIMED_COUNTER_CONFIG.threshold + 1)
    );

    // continuous failure in long time, but not reached remind time
    let [unhealthy, unrecovered, elapsed] = (counter as any).onFailureAt(
      new Date(now.getTime() + TEST_TIMED_COUNTER_CONFIG.threshold + 2)
    );
    chai.expect(unhealthy).to.be.false;
    chai.expect(unrecovered).to.be.false;
    chai.expect(elapsed).to.equal(TEST_TIMED_COUNTER_CONFIG.threshold + 2);

    // continuous failure and reached remind time
    [unhealthy, unrecovered, elapsed] = (counter as any).onFailureAt(
      new Date(now.getTime() + TEST_TIMED_COUNTER_CONFIG.threshold + 2 + TEST_TIMED_COUNTER_CONFIG.remind)
    );
    chai.expect(unhealthy).to.be.false;
    chai.expect(unrecovered).to.be.true;
    chai.expect(elapsed).to.equal(TEST_TIMED_COUNTER_CONFIG.threshold + 2 + TEST_TIMED_COUNTER_CONFIG.remind);

    // recovered
    const [recovered, recoveredElapsed] = (counter as any).onSuccessAt(
      new Date(now.getTime() + TEST_TIMED_COUNTER_CONFIG.threshold + 3 + TEST_TIMED_COUNTER_CONFIG.remind)
    );
    chai.expect(recovered).to.be.true;
    chai.expect(recoveredElapsed).to.equal(TEST_TIMED_COUNTER_CONFIG.threshold + 3 + TEST_TIMED_COUNTER_CONFIG.remind);
  });
});