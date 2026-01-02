import React from "react";
import "./theme-provider.scss";
import "../../themes/light-theme.scss";
import "../../themes/dark-theme.scss";

interface ChildrenProp {
  children: React.JSX.Element | React.JSX.Element[];
}
const ThemeProvider = ({ children }: ChildrenProp) => {
  return <div className="app dark">{children}</div>;
};

export default ThemeProvider;
