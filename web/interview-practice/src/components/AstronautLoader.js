import React from 'react';
import './AstronautLoader.css';

const AstronautLoader = () => {
  return (
    <div className="fullscreen-loader">
      <div className="loader-top">
        <div className="box-of-star1">
          {[...Array(7)].map((_, i) => (
            <div key={`star1-${i}`} className={`star star-position${i + 1}`}></div>
          ))}
        </div>
        <div className="box-of-star2">
          {[...Array(7)].map((_, i) => (
            <div key={`star2-${i}`} className={`star star-position${i + 1}`}></div>
          ))}
        </div>
        <div className="box-of-star3">
          {[...Array(7)].map((_, i) => (
            <div key={`star3-${i}`} className={`star star-position${i + 1}`}></div>
          ))}
        </div>
        <div className="box-of-star4">
          {[...Array(7)].map((_, i) => (
            <div key={`star4-${i}`} className={`star star-position${i + 1}`}></div>
          ))}
        </div>
        <div className="astronaut" data-js="astro">
          <div className="head"></div>
          <div className="arm arm-left"></div>
          <div className="arm arm-right"></div>
          <div className="body">
            <div className="panel"></div>
          </div>
          <div className="leg leg-left"></div>
          <div className="leg leg-right"></div>
          <div className="schoolbag"></div>
        </div>
      </div>
      <div className="loader-bottom">
        <div className="loader-wrapper">
          <span className="loader-letter">G</span>
          <span className="loader-letter">e</span>
          <span className="loader-letter">n</span>
          <span className="loader-letter">e</span>
          <span className="loader-letter">r</span>
          <span className="loader-letter">a</span>
          <span className="loader-letter">t</span>
          <span className="loader-letter">i</span>
          <span className="loader-letter">n</span>
          <span className="loader-letter">g</span>
          <div className="loader"></div>
        </div>
      </div>
    </div>
  );
};

export default AstronautLoader;
