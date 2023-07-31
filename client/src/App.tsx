import ThemeProvider from "./components/theme-provider/theme-provider";
import "./App.scss";
import Layout from "./layout/layout";

const App = () => {
  const randomNumber = Math.random();
  return (
    <ThemeProvider>
      <Layout randomNumber={randomNumber}></Layout>
    </ThemeProvider>
  );
};

export default App;
