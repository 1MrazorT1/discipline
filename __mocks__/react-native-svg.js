const React = require("react");

// Capture props for assertions in tests
const captured = [];

const makeComp = (name) => (props) => {
  if (name === "Circle") {
    captured.push(props);
  }
  return React.createElement(name, props);
};

const Svg = makeComp("Svg");
const Circle = makeComp("Circle");

module.exports = {
  __esModule: true,
  default: Svg,
  Svg,
  Circle,
  _captured: captured,
};
