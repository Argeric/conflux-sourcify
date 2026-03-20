import chai from "chai";
import { Counter, CounterConfig } from "./counter";

const testCounterConfig: CounterConfig = {
  threshold: 5,
  remind: 10
};

describe("Counter", () => {
  it("should process continuous success", () => {
    const counter = new Counter(testCounterConfig);

    const { recovered, failures } = counter.onSuccess();
    chai.expect(recovered).to.be.false;
    chai.expect(failures).to.equal(0);
  });

  it("should process failed in short time", () => {
    const counter = new Counter(testCounterConfig);

    // first failure
    const result1 = counter.onFailure();
    chai.expect(result1.unhealthy).to.be.false;
    chai.expect(result1.unrecovered).to.be.false;
    chai.expect(result1.failures).to.equal(1);

    // continuous failure in short time
    const result2 = counter.onFailure();
    chai.expect(result2.unhealthy).to.be.false;
    chai.expect(result2.unrecovered).to.be.false;
    chai.expect(result2.failures).to.equal(2);

    // recovered
    const { recovered, failures } = counter.onSuccess();
    chai.expect(recovered).to.be.false;
    chai.expect(failures).to.equal(2);
  });

  it("should process threshold", () => {
    const counter = new Counter(testCounterConfig);

    // continuous failure in short time
    for (let i = 1; i < testCounterConfig.threshold; i++) {
      const result = counter.onFailure();
      chai.expect(result.unhealthy).to.be.false;
      chai.expect(result.unrecovered).to.be.false;
      chai.expect(result.failures).to.equal(i);
    }

    // continuous failure in long time
    const thresholdResult = counter.onFailure();
    chai.expect(thresholdResult.unhealthy).to.be.true;
    chai.expect(thresholdResult.unrecovered).to.be.false;
    chai.expect(thresholdResult.failures).to.equal(testCounterConfig.threshold);

    // continuous failure in long time, but not reached to remind counter
    const nextResult = counter.onFailure();
    chai.expect(nextResult.unhealthy).to.be.false;
    chai.expect(nextResult.unrecovered).to.be.false;
    chai.expect(nextResult.failures).to.equal(testCounterConfig.threshold + 1);

    // recovered
    const { recovered, failures } = counter.onSuccess();
    chai.expect(recovered).to.be.true;
    chai.expect(failures).to.equal(testCounterConfig.threshold + 1);
  });

  it("should process remind", () => {
    const counter = new Counter(testCounterConfig);

    // continuous failure in short time
    for (let i = 1; i < testCounterConfig.threshold + testCounterConfig.remind; i++) {
      const result = counter.onFailure();
      chai.expect(result.unrecovered).to.be.false;
      chai.expect(result.failures).to.equal(i);
    }

    // continuous failure and reached remind time
    const remindResult = counter.onFailure();
    chai.expect(remindResult.unhealthy).to.be.false;
    chai.expect(remindResult.unrecovered).to.be.true;
    chai.expect(remindResult.failures).to.equal(testCounterConfig.threshold + testCounterConfig.remind);

    // recovered
    const { recovered, failures } = counter.onSuccess();
    chai.expect(recovered).to.be.true;
    chai.expect(failures).to.equal(testCounterConfig.threshold + testCounterConfig.remind);
  });
});
