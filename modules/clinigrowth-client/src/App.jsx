import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GrowchartProvider } from "./Components/Growchart/GrowchartContext";
import Sidebar from "./Components/Growchart/Sidebar";
import GrowChart from "./Components/Growchart/growchart.tsx";
import GrowchartDetail from "./Components/Growchart/GrowchartDetail";
import TDSCChartManager from "./Components/Growchart/TDSchartmanager.tsx";
import AddPatient from "./Components/Growchart/AddPatient";
import { useState } from "react";

function App() {
  const [sidebarWidth, setSidebarWidth] = useState(260);

  // Mounted at /clinigrowth (correct spelling) inside ZoeConnect -- see vite.config.js's matching base:'/clinigrowth/' comment.
  return (
    <BrowserRouter basename="/clinigrowth">
      <GrowchartProvider>
        <Sidebar onWidthChange={setSidebarWidth} />
        <div style={{ marginLeft: `${sidebarWidth}px`, transition: "margin-left 0.3s ease" }}>
          <Routes>
            <Route path="/" element={<GrowChart />} />
            <Route path="/detail" element={<GrowchartDetail />} />
            <Route path="/TDSC3yrs" element={<TDSCChartManager />} />
            <Route path="/add-patient" element={<AddPatient />} />
            <Route path="/edit-patient" element={<AddPatient />} />
          </Routes>
        </div>
      </GrowchartProvider>
    </BrowserRouter>
  );
}

export default App;