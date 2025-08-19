import React from 'react';
import './SpacecraftLoader.css';

const SpacecraftLoader = () => {
  return (
    <div className="spacecraft-loader">
      <div className="clouds">
        <div className="cloud cloud1"></div>
        <div className="cloud cloud2"></div>
        <div className="cloud cloud3"></div>
        <div className="cloud cloud4"></div>
        <div className="cloud cloud5"></div>
      </div>

      <div className="loader">
        <span><span></span><span></span><span></span><span></span></span>
        <div className="base">
          <span></span>
          <div className="face"></div>
        </div>
      </div>

      <div className="longfazers">
        <span></span><span></span><span></span><span></span>
      </div>
    </div>
  );
};

export default SpacecraftLoader;
