import { render } from "@testing-library/react-native";
import { ProgressRing } from "@/components/ProgressRing";

// The __mocks__/react-native-svg.js mock captures Circle props here.
// We access it via require to avoid TS errors (the real package has no _captured export).
const svgMock = require("react-native-svg") as typeof import("react-native-svg") & {
  _captured: Record<string, unknown>[];
};
const circles: Record<string, unknown>[] = svgMock._captured;

describe("ProgressRing", () => {
  beforeEach(() => {
    circles.length = 0;
  });

  it("renders two circles (track + progress)", async () => {
    await render(
      <ProgressRing size={220} strokeWidth={14} progress={0.5} color="#3f9c75" />,
    );
    expect(circles).toHaveLength(2);
  });

  it("computes the radius, cx, cy from size and strokeWidth", async () => {
    await render(
      <ProgressRing size={220} strokeWidth={14} progress={0.5} color="#3f9c75" />,
    );

    const progressCircle = circles.find(
      (c) => c.strokeDasharray !== undefined,
    );
    expect(progressCircle).toBeDefined();

    const expectedRadius = (220 - 14) / 2;
    expect(progressCircle!.r).toBe(expectedRadius);
    expect(progressCircle!.cx).toBe(110);
    expect(progressCircle!.cy).toBe(110);
    expect(progressCircle!.stroke).toBe("#3f9c75");
    expect(progressCircle!.strokeWidth).toBe(14);
    expect(progressCircle!.fill).toBe("none");
  });

  it("computes strokeDasharray and strokeDashoffset from progress", async () => {
    await render(
      <ProgressRing size={220} strokeWidth={14} progress={0.5} color="#3f9c75" />,
    );

    const progressCircle = circles.find(
      (c) => c.strokeDasharray !== undefined,
    );
    const circumference = 2 * Math.PI * ((220 - 14) / 2);

    expect(progressCircle!.strokeDasharray).toBe(`${circumference} ${circumference}`);
    // progress 0.5 → offset = circumference * (1 - 0.5)
    expect(progressCircle!.strokeDashoffset).toBeCloseTo(circumference * 0.5, 2);
  });

  it("clamps progress above 1.0 so offset is ~0", async () => {
    await render(
      <ProgressRing size={100} strokeWidth={10} progress={1.5} color="#d95b43" />,
    );

    const progressCircle = circles.find(
      (c) => c.strokeDasharray !== undefined,
    );
    expect(progressCircle!.strokeDashoffset).toBeCloseTo(0, 5);
  });

  it("clamps progress below 0 so offset equals full circumference", async () => {
    await render(
      <ProgressRing size={100} strokeWidth={10} progress={-0.5} color="#d95b43" />,
    );

    const progressCircle = circles.find(
      (c) => c.strokeDasharray !== undefined,
    );
    const radius = (100 - 10) / 2;
    const circumference = 2 * Math.PI * radius;
    expect(progressCircle!.strokeDashoffset).toBeCloseTo(circumference, 2);
  });

  it("uses default trackColor when not provided", async () => {
    await render(
      <ProgressRing size={100} strokeWidth={10} progress={0.5} color="#3f9c75" />,
    );

    const trackCircle = circles.find((c) => c.stroke === "#eadfcb");
    expect(trackCircle).toBeDefined();
  });

  it("renders zero progress offset equal to full circumference", async () => {
    await render(
      <ProgressRing size={100} strokeWidth={10} progress={0} color="#2f7f86" />,
    );

    const progressCircle = circles.find(
      (c) => c.strokeDasharray !== undefined,
    );
    const radius = (100 - 10) / 2;
    const circumference = 2 * Math.PI * radius;
    expect(progressCircle!.strokeDashoffset).toBeCloseTo(circumference, 2);
  });

  it("renders full progress (1.0) with zero offset", async () => {
    await render(
      <ProgressRing size={100} strokeWidth={10} progress={1.0} color="#2f7f86" />,
    );

    const progressCircle = circles.find(
      (c) => c.strokeDasharray !== undefined,
    );
    expect(progressCircle!.strokeDashoffset).toBeCloseTo(0, 5);
  });
});
