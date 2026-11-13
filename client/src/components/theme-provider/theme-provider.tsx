import React from "react";
import { ConfigProvider, theme } from "antd";
import "./theme-provider.scss";
import "../../themes/light-theme.scss";
import "../../themes/dark-theme.scss";

interface ChildrenProp {
  children: React.JSX.Element | React.JSX.Element[];
}
const ThemeProvider = ({ children }: ChildrenProp) => {
  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorPrimary: "#55aa99", borderRadius: 6 } }}>
      <div className="app dark">{children}</div>
    </ConfigProvider>
  );
};

export default ThemeProvider;
