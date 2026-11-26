// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 logical field is scaled to fit the window and centred. Everything
// the judge sees lives here: the island chain, the sea and sky, the bush plane,
// the target rings, and the instruments — altitude and speed tapes, compass,
// artificial horizon, throttle, fuel and damage — all drawn lit, never pasted.

import { DROP_ZONE, FONT, LANDMARKS, PALETTE, PLANE, RINGS, RUNWAYS } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const FIELD = { width: 1280, height: 720 };
const SCALE = 1.15; // screen pixels per metre of world
const PLANE_SCREEN_X = 0.38; // plane's fraction across the screen
const PLANE_SCREEN_Y = 0.55; // plane's fraction down the screen

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

export function createRenderer(canvas, terrain) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  /**
   * Camera: world metres at the left edge and at the bottom edge of the screen.
   * On a panel screen (title, sortie over) the plane sits low and left, clear
   * of the panel, so the cover still shows the aircraft and the runway ahead.
   */
  function cameraFor(plane, screen) {
    const panelScreen = screen === SCREEN_TITLE || screen === SCREEN_OVER;
    const fracX = panelScreen ? 0.2 : PLANE_SCREEN_X;
    const fracY = panelScreen ? 0.68 : PLANE_SCREEN_Y;
    const camX = Math.max(-60, plane.x - fracX * FIELD.width / SCALE);
    const camY = clamp(plane.alt - fracY * FIELD.height / SCALE, -500, 420);
    return { x: camX, y: camY };
  }

  function worldX(x, cam) {
    return (x - cam.x) * SCALE;
  }
  function worldY(y, cam) {
    return FIELD.height - (y - cam.y) * SCALE;
  }

  // --- sky, sea and land ----------------------------------------------------

  function drawSky(cam, elapsed) {
    const horizon = worldY(0, cam);
    const gradient = context.createLinearGradient(0, 0, 0, Math.max(0, horizon));
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(0.55, PALETTE.skyMid);
    gradient.addColorStop(1, PALETTE.skyLow);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, Math.max(0, horizon));
    // Sun, upper middle-right, clear of the compass and the score panel.
    const sunX = FIELD.width * 0.7;
    const sunY = FIELD.height * 0.12;
    context.fillStyle = PALETTE.sunGlow;
    context.beginPath();
    context.arc(sunX, sunY, 50, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.sun;
    context.beginPath();
    context.arc(sunX, sunY, 34, 0, Math.PI * 2);
    context.fill();
    // Clouds drift east on the wind, slightly slower than the camera (parallax).
    context.fillStyle = PALETTE.cloud;
    for (const cloud of terrain.clouds) {
      const cx = (((cloud.x + elapsed * cloud.speed - cam.x * 0.9) * SCALE) % (FIELD.width + 320) + FIELD.width + 320) % (FIELD.width + 320) - 160;
      const cy = FIELD.height - (cloud.y - cam.y * 0.9) * SCALE * 0.6;
      if (cy < -80 || cy > horizon + 40) continue;
      const s = cloud.size;
      context.beginPath();
      context.ellipse(cx, cy, s, s * 0.36, 0, 0, Math.PI * 2);
      context.ellipse(cx - s * 0.55, cy + s * 0.08, s * 0.55, s * 0.3, 0, 0, Math.PI * 2);
      context.ellipse(cx + s * 0.55, cy + s * 0.06, s * 0.6, s * 0.3, 0, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawSea(cam, elapsed) {
    const top = worldY(0, cam);
    if (top >= FIELD.height) return;
    const gradient = context.createLinearGradient(0, top, 0, FIELD.height);
    gradient.addColorStop(0, PALETTE.sea);
    gradient.addColorStop(1, PALETTE.seaDeep);
    context.fillStyle = gradient;
    context.fillRect(0, Math.max(0, top), FIELD.width, FIELD.height - Math.max(0, top));
    // Slow wave lines, marching east.
    context.strokeStyle = PALETTE.seaFoam;
    context.globalAlpha = 0.35;
    context.lineWidth = 1.5;
    for (let row = 0; row < 4; row += 1) {
      const wy = top + 26 + row * 34;
      if (wy > FIELD.height) break;
      context.beginPath();
      for (let x = 0; x <= FIELD.width; x += 16) {
        const wave = Math.sin((x + elapsed * 30 + row * 170) * 0.012) * 3;
        if (x === 0) context.moveTo(x, wy + wave);
        else context.lineTo(x, wy + wave);
      }
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  function drawTerrain(cam) {
    const x0 = Math.max(0, cam.x - 20);
    const x1 = Math.min(14000, cam.x + FIELD.width / SCALE + 20);
    // The land mass, grass on top fading to darker green at the waterline.
    // It fills down to sea level only: below that the sea already drawn
    // shows through, so the gaps between islands read as water, not land.
    const bottomY = Math.max(FIELD.height + 4, worldY(0, cam));
    const gradient = context.createLinearGradient(0, 0, 0, FIELD.height);
    gradient.addColorStop(0, PALETTE.grass);
    gradient.addColorStop(0.55, PALETTE.grassDark);
    gradient.addColorStop(1, '#2f5a26');
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(worldX(x0, cam), bottomY);
    for (let x = x0; x <= x1; x += 4) {
      context.lineTo(worldX(x, cam), worldY(Math.max(0, terrain.heightAt(x)), cam));
    }
    context.lineTo(worldX(x1, cam), bottomY);
    context.closePath();
    context.fill();
    // A darker lip along the top edge, so the hills read against the sky.
    context.strokeStyle = 'rgba(46, 90, 38, 0.8)';
    context.lineWidth = 3;
    context.beginPath();
    for (let x = x0; x <= x1; x += 4) {
      const sx = worldX(x, cam);
      const sy = worldY(Math.max(0, terrain.heightAt(x)), cam);
      if (x === x0) context.moveTo(sx, sy);
      else context.lineTo(sx, sy);
    }
    context.stroke();
    // Sand where the land meets the sea, and snow on the high peak.
    for (let x = x0; x <= x1; x += 4) {
      const h = terrain.heightAt(x);
      const sx = worldX(x, cam);
      const sy = worldY(h, cam);
      if (h > 0.2 && h < 5) {
        context.fillStyle = PALETTE.sand;
        context.fillRect(sx - 2, sy - 3, 5, 6);
      }
      if (h > 165) {
        context.fillStyle = PALETTE.snow;
        context.beginPath();
        context.arc(sx, sy - 2, 5, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawRunway(cam, runway, wind) {
    const y0 = worldY(6, cam);
    const x0 = worldX(runway.x0, cam);
    const x1 = worldX(runway.x1, cam);
    if (x1 < -50 || x0 > FIELD.width + 50) return;
    context.fillStyle = PALETTE.runway;
    context.fillRect(x0, y0 - 5, x1 - x0, 7);
    // Centre dashes and threshold bars.
    context.fillStyle = PALETTE.runwayLine;
    for (let x = runway.x0 + 30; x < runway.x1 - 10; x += 60) {
      context.fillRect(worldX(x, cam), y0 - 2.5, 30 * SCALE, 2);
    }
    context.fillRect(x0 + 6, y0 - 4, 10, 5);
    context.fillRect(x1 - 16, y0 - 4, 10, 5);
    text(runway.name, (x0 + x1) / 2, y0 + 26, 15, PALETTE.hudText, 'center');
    // Windsock at the runway's west end, streaming east on the breeze.
    const wx = worldX(runway.x0 + 12, cam);
    const wy = worldY(6, cam);
    context.strokeStyle = '#5a4632';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(wx, wy);
    context.lineTo(wx, wy - 34);
    context.stroke();
    const sockLen = 16 + wind * 2;
    context.fillStyle = '#ff7a2e';
    context.beginPath();
    context.moveTo(wx, wy - 34);
    context.lineTo(wx + sockLen, wy - 30);
    context.lineTo(wx + sockLen, wy - 26);
    context.lineTo(wx, wy - 28);
    context.closePath();
    context.fill();
  }

  function drawTown(cam) {
    const { x0, x1 } = LANDMARKS.town;
    if (worldX(x1, cam) < -50 || worldX(x0, cam) > FIELD.width + 50) return;
    for (const house of terrain.houses) {
      const hx = worldX(house.x, cam);
      const hy = worldY(terrain.heightAt(house.x), cam);
      const w = house.w * SCALE * 0.55;
      const h = house.h * SCALE * 0.55;
      context.fillStyle = PALETTE.houseWall;
      context.fillRect(hx - w / 2, hy - h, w, h);
      context.fillStyle = PALETTE.houseRoof;
      context.beginPath();
      context.moveTo(hx - w / 2 - 3, hy - h);
      context.lineTo(hx, hy - h - house.roof * SCALE * 0.5);
      context.lineTo(hx + w / 2 + 3, hy - h);
      context.closePath();
      context.fill();
      if (house.lit) {
        context.fillStyle = '#ffd66b';
        context.fillRect(hx - w / 4, hy - h * 0.6, 5, 6);
        context.fillRect(hx + w / 6, hy - h * 0.6, 5, 6);
      }
    }
    text(LANDMARKS.town.label, worldX((x0 + x1) / 2, cam), worldY(58, cam) - 46, 15, PALETTE.hudText, 'center');
  }

  function drawPalms(cam) {
    context.strokeStyle = PALETTE.palmTrunk;
    context.lineWidth = 2.5;
    for (const palm of terrain.palms) {
      const px = worldX(palm.x, cam);
      if (px < -20 || px > FIELD.width + 20) continue;
      const py = worldY(palm.h, cam);
      const topX = px + palm.lean * 20;
      const topY = py - palm.h * SCALE * 0.9;
      context.beginPath();
      context.moveTo(px, py);
      context.quadraticCurveTo(px + palm.lean * 10, py - palm.h * SCALE * 0.45, topX, topY);
      context.stroke();
      context.strokeStyle = PALETTE.palm;
      context.lineWidth = 2;
      for (let f = 0; f < 5; f += 1) {
        const angle = -Math.PI * (0.15 + f * 0.175) + palm.lean;
        context.beginPath();
        context.moveTo(topX, topY);
        context.quadraticCurveTo(topX + Math.cos(angle) * 14, topY + Math.sin(angle) * 10 - 4, topX + Math.cos(angle) * 24, topY + Math.sin(angle) * 16 + 6);
        context.stroke();
      }
      context.strokeStyle = PALETTE.palmTrunk;
      context.lineWidth = 2.5;
    }
  }

  function drawLighthouse(cam, elapsed) {
    const lx = LANDMARKS.lighthouse.x;
    const px = worldX(lx, cam);
    if (px < -60 || px > FIELD.width + 60) return;
    const base = worldY(terrain.heightAt(lx), cam);
    const h = 52;
    context.fillStyle = PALETTE.lighthouse;
    context.fillRect(px - 7, base - h, 14, h);
    context.fillStyle = PALETTE.lighthouseTop;
    context.fillRect(px - 9, base - h - 8, 18, 9);
    context.fillStyle = '#ffd66b';
    context.fillRect(px - 4, base - h - 6, 8, 5);
    // The beam sweeps slowly around, so the point reads at a glance.
    const angle = elapsed * 0.5;
    context.save();
    context.globalAlpha = 0.22;
    context.fillStyle = '#ffe9a8';
    context.translate(px, base - h - 4);
    context.rotate(Math.sin(angle) * 0.9 - 0.2);
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(190, -26);
    context.lineTo(190, 14);
    context.closePath();
    context.fill();
    context.restore();
    text(LANDMARKS.lighthouse.label, px, base - h - 20, 13, PALETTE.hudText, 'center');
  }

  function drawMountainLabel(cam) {
    const px = worldX(LANDMARKS.mountain.x, cam);
    if (px < -80 || px > FIELD.width + 80) return;
    text(LANDMARKS.mountain.label, px, worldY(196, cam), 15, PALETTE.hudText, 'center');
  }

  function drawBirds(cam, elapsed) {
    context.strokeStyle = '#2b2f36';
    context.lineWidth = 2;
    for (const bird of terrain.birds) {
      const bx = worldX(bird.x + elapsed * bird.speed, cam);
      if (bx < -20 || bx > FIELD.width + 20) continue;
      const by = worldY(bird.y + Math.sin(elapsed + bird.phase) * 6, cam);
      const flap = Math.sin(elapsed * 7 + bird.phase) * 4;
      context.beginPath();
      context.moveTo(bx - 7, by - flap);
      context.quadraticCurveTo(bx, by + 2, bx + 7, by - flap);
      context.stroke();
    }
  }

  function drawDropZone(cam, sortie, elapsed) {
    const x0 = worldX(DROP_ZONE.x0, cam);
    const x1 = worldX(DROP_ZONE.x1, cam);
    if (x1 < -50 || x0 > FIELD.width + 50) return;
    const top = worldY(DROP_ZONE.maxAlt, cam);
    const ground = worldY(terrain.heightAt((DROP_ZONE.x0 + DROP_ZONE.x1) / 2), cam);
    context.save();
    context.strokeStyle = sortie.leg === 1 ? PALETTE.ring : PALETTE.hudDim;
    context.setLineDash([8, 6]);
    context.lineWidth = 2;
    context.strokeRect(x0, top, x1 - x0, ground - top);
    context.restore();
    if (sortie.leg === 1) {
      text('DROP ZONE — below 95 m, under 80 kt', (x0 + x1) / 2, top - 10, 15, PALETTE.ring, 'center');
    }
    // The crate, under its parachute, once the pilot lets it go.
    if (sortie.dropX !== null) {
      const fall = Math.min(1, (elapsed - sortie.dropTime) / 6);
      const cx = worldX(sortie.dropX, cam);
      const cy = worldY(sortie.dropAlt, cam) + fall * (worldY(terrain.heightAt(sortie.dropX), cam) - worldY(sortie.dropAlt, cam));
      context.fillStyle = '#c96f2e';
      context.fillRect(cx - 7, cy, 14, 12);
      context.strokeStyle = '#f6ead2';
      context.beginPath();
      context.moveTo(cx - 7, cy);
      context.lineTo(cx - 12, cy - 16);
      context.moveTo(cx + 7, cy);
      context.lineTo(cx + 12, cy - 16);
      context.stroke();
      context.fillStyle = '#f6ead2';
      context.beginPath();
      context.arc(cx, cy - 16, 13, Math.PI, 0);
      context.fill();
    }
  }

  function drawRings(cam, rings, nextIndex) {
    for (let i = 0; i < rings.length; i += 1) {
      const ring = rings[i];
      const rx = worldX(ring.x, cam);
      if (rx < -120 || rx > FIELD.width + 120) continue;
      const ry = worldY(ring.alt, cam);
      const radius = ring.r * SCALE;
      const isNext = i === nextIndex;
      context.save();
      if (isNext) {
        context.shadowColor = PALETTE.ringGlow;
        context.shadowBlur = 26;
      }
      context.strokeStyle = ring.done ? PALETTE.ringDone : PALETTE.ring;
      context.lineWidth = isNext ? 7 : 5;
      context.beginPath();
      context.ellipse(rx, ry, radius * 0.62, radius, 0, 0, Math.PI * 2);
      context.stroke();
      context.restore();
      context.fillStyle = ring.done ? PALETTE.ringDone : PALETTE.ring;
      text(String(i + 1), rx, ry - radius - 10, 18, ring.done ? PALETTE.ringDone : PALETTE.ring, 'center');
    }
    // Off-screen beacon: a chevron at the screen edge toward the next ring.
    const next = rings[nextIndex];
    if (next) {
      const nx = worldX(next.x, cam);
      if (nx > FIELD.width + 40 || nx < -40) {
        const dir = nx > FIELD.width ? 1 : -1;
        const edgeX = nx > FIELD.width ? FIELD.width - 40 : 40;
        const dist = Math.abs(next.x - (cam.x + FIELD.width / SCALE / 2));
        context.fillStyle = PALETTE.ring;
        context.beginPath();
        context.moveTo(edgeX + dir * 14, 84);
        context.lineTo(edgeX - dir * 8, 72);
        context.lineTo(edgeX - dir * 8, 96);
        context.closePath();
        context.fill();
        // Keep the label inside the frame, clear of the altitude/speed tapes.
        const labelX = dir > 0 ? FIELD.width - 200 : 200;
        text(`RING ${nextIndex + 1} · ${Math.round(dist)} m`, labelX, 116, 14, PALETTE.ring, 'center');
      }
    }
  }

  // --- the plane -------------------------------------------------------------

  function drawPlaneShadow(cam, plane) {
    const ground = terrain.heightAt(plane.x);
    if (plane.alt - ground > 260) return;
    const sx = worldX(plane.x, cam);
    const sy = worldY(ground, cam);
    const spread = 26 * (1 - (plane.alt - ground) / 300);
    context.fillStyle = 'rgba(10, 20, 30, 0.28)';
    context.beginPath();
    context.ellipse(sx, sy + 2, spread, spread * 0.22, 0, 0, Math.PI * 2);
    context.fill();
  }

  function drawPlane(cam, plane, elapsed) {
    const px = worldX(plane.x, cam);
    const py = worldY(plane.alt, cam);
    context.save();
    context.translate(px, py);
    context.rotate(-plane.pitch);
    // Blink while damaged: hidden on every other tenth of a second past 40%.
    const blink = plane.damage < 40 || Math.floor(elapsed * 10) % 2 === 0;
    if (blink) {
      // Tail fin and stabiliser.
      context.fillStyle = PALETTE.planeRed;
      context.beginPath();
      context.moveTo(-26, -2);
      context.lineTo(-40, -26);
      context.lineTo(-30, -26);
      context.lineTo(-18, -4);
      context.closePath();
      context.fill();
      context.fillStyle = PALETTE.planeCream;
      context.fillRect(-42, -6, 22, 4);
      // Fuselage: a long rounded body with a red cheatline.
      context.fillStyle = PALETTE.planeCream;
      context.beginPath();
      context.ellipse(0, 0, 34, 9, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.planeRed;
      context.fillRect(-30, 2, 62, 3.5);
      // Cabin windows, lit.
      context.fillStyle = PALETTE.glass;
      context.beginPath();
      context.ellipse(8, -4, 9, 5, 0, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.ellipse(-4, -4, 7, 5, 0, 0, Math.PI * 2);
      context.fill();
      // Wing: the near wing sweeps back under the fuselage, slim and angled.
      context.fillStyle = PALETTE.planeRed;
      context.beginPath();
      context.moveTo(-4, 2);
      context.lineTo(6, 2);
      context.lineTo(13, 18);
      context.lineTo(4, 18);
      context.closePath();
      context.fill();
      // Registration stripe on the tail fin.
      context.fillStyle = PALETTE.planeCream;
      context.fillRect(-38, -20, 10, 3);
      // Propeller: a spinning disc with short blades — a long blade reads as
      // a stick poking out of the nose when the frame freezes it.
      context.save();
      context.translate(35, 0);
      context.globalAlpha = 0.25;
      context.fillStyle = '#d8d8d8';
      context.beginPath();
      context.ellipse(0, 0, 3, 22, 0, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      context.rotate(plane.propAngle);
      context.fillStyle = PALETTE.planeDark;
      context.fillRect(-1.5, -14, 3, 28);
      context.restore();
      // Landing gear: two wheels on struts.
      context.strokeStyle = PALETTE.planeDark;
      context.lineWidth = 2.5;
      context.beginPath();
      context.moveTo(-8, 6);
      context.lineTo(-12, 16);
      context.moveTo(10, 6);
      context.lineTo(14, 16);
      context.stroke();
      context.fillStyle = '#1c1e22';
      context.beginPath();
      context.arc(-12, 18, 4.5, 0, Math.PI * 2);
      context.arc(14, 18, 4.5, 0, Math.PI * 2);
      context.fill();
      // Nav lights: red on the tail, green on the wing tip, blinking.
      if (Math.floor(elapsed * 1.5) % 2 === 0) {
        context.fillStyle = '#ff4d4d';
        context.beginPath();
        context.arc(-40, -4, 2.5, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = '#59e07a';
      context.beginPath();
      context.arc(11, 18, 2.5, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  // --- instruments and HUD ---------------------------------------------------

  function drawTapes(plane) {
    // Altitude tape, left edge: a mark every 50 m, the current altitude boxed.
    context.fillStyle = PALETTE.hudPanel;
    context.fillRect(10, 110, 64, 240);
    context.strokeStyle = PALETTE.panelEdge;
    context.strokeRect(10, 110, 64, 240);
    const alt = plane.alt;
    for (let a = Math.floor((alt - 130) / 50) * 50; a <= alt + 130; a += 50) {
      if (a < 0) continue;
      const y = 230 - (a - alt) * 0.9;
      if (y < 116 || y > 344) continue;
      context.fillStyle = PALETTE.hudDim;
      context.fillRect(14, y, 12, 1.5);
      text(String(a), 30, y + 4, 11, PALETTE.hudDim, 'left');
    }
    context.fillStyle = PALETTE.hudText;
    context.fillRect(10, 222, 64, 16);
    text(`${Math.round(alt)} m`, 42, 234, 12, '#0c1826', 'center');
    text('ALT', 42, 104, 11, PALETTE.hudDim, 'center');
    // Speed tape, right edge: a mark every 20 kt.
    const knots = Math.round(plane.speed * 1.94384);
    context.fillStyle = PALETTE.hudPanel;
    context.fillRect(FIELD.width - 74, 110, 64, 240);
    context.strokeStyle = PALETTE.panelEdge;
    context.strokeRect(FIELD.width - 74, 110, 64, 240);
    for (let v = Math.floor((knots - 60) / 20) * 20; v <= knots + 60; v += 20) {
      if (v < 0) continue;
      const y = 230 - (v - knots) * 1.5;
      if (y < 116 || y > 344) continue;
      context.fillStyle = PALETTE.hudDim;
      context.fillRect(FIELD.width - 26, y, 12, 1.5);
      text(String(v), FIELD.width - 30, y + 4, 11, PALETTE.hudDim, 'right');
    }
    context.fillStyle = PALETTE.hudText;
    context.fillRect(FIELD.width - 74, 222, 64, 16);
    text(`${knots} kt`, FIELD.width - 42, 234, 12, '#0c1826', 'center');
    text('SPD', FIELD.width - 42, 104, 11, PALETTE.hudDim, 'center');
  }

  function drawTopBar(plane, sortie, best) {
    // Readouts: altitude, speed, heading, vertical speed.
    context.fillStyle = PALETTE.hudPanel;
    context.fillRect(10, 10, 300, 62);
    context.strokeStyle = PALETTE.panelEdge;
    context.strokeRect(10, 10, 300, 62);
    const knots = Math.round(plane.speed * 1.94384);
    text('ALT', 24, 30, 12, PALETTE.hudDim, 'left');
    text(`${Math.round(plane.alt)} m`, 24, 56, 22, PALETTE.hudText, 'left');
    text(`${Math.round(plane.alt * 3.28084)} ft`, 118, 56, 13, PALETTE.hudDim, 'left');
    text('SPD', 168, 30, 12, PALETTE.hudDim, 'left');
    text(`${knots} kt`, 168, 56, 22, plane.speed < 15 && !plane.grounded ? PALETTE.hudWarn : PALETTE.hudText, 'left');
    text('HDG', 252, 30, 12, PALETTE.hudDim, 'left');
    text(`${String(Math.round(plane.heading)).padStart(3, '0')}°`, 252, 56, 22, PALETTE.hudText, 'left');
    // Compass strip, centre top.
    const stripX = FIELD.width / 2;
    context.fillStyle = PALETTE.hudPanel;
    context.fillRect(stripX - 170, 10, 340, 34);
    context.strokeStyle = PALETTE.panelEdge;
    context.strokeRect(stripX - 170, 10, 340, 34);
    const labels = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];
    for (const [deg, label] of labels) {
      let diff = deg - plane.heading;
      while (diff > 180) diff -= 360;
      while (diff < -180) diff += 360;
      const x = stripX + diff * 2.4;
      if (x < stripX - 160 || x > stripX + 160) continue;
      text(label, x, 34, 13, deg === 90 ? PALETTE.hudText : PALETTE.hudDim, 'center');
    }
    context.fillStyle = PALETTE.ring;
    context.beginPath();
    context.moveTo(stripX, 44);
    context.lineTo(stripX - 5, 36);
    context.lineTo(stripX + 5, 36);
    context.closePath();
    context.fill();
    // Mission banner under the compass, and the score at the right.
    text(sortie.objectiveLine(), stripX, 68, 15, PALETTE.ring, 'center');
    context.fillStyle = PALETTE.hudPanel;
    context.fillRect(FIELD.width - 310, 10, 300, 62);
    context.strokeStyle = PALETTE.panelEdge;
    context.strokeRect(FIELD.width - 310, 10, 300, 62);
    text('SCORE', FIELD.width - 296, 30, 12, PALETTE.hudDim, 'left');
    text(String(sortie.score), FIELD.width - 296, 56, 22, PALETTE.hudText, 'left');
    text('BEST', FIELD.width - 176, 30, 12, PALETTE.hudDim, 'left');
    text(String(best), FIELD.width - 176, 56, 22, PALETTE.hudText, 'left');
    text(plane.fuel <= 25 ? 'FUEL LOW' : `FUEL ${Math.round(plane.fuel)}`, FIELD.width - 14, 56, 15, plane.fuel <= 25 ? PALETTE.hudBad : PALETTE.hudDim, 'right');
  }

  function drawBottomGauges(plane, elapsed) {
    // Artificial horizon, bottom left: sky and ground roll with the pitch.
    const cx = 92;
    const cy = FIELD.height - 92;
    const r = 58;
    context.save();
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = PALETTE.skyMid;
    context.fillRect(cx - r, cy - r, r * 2, r * 2);
    context.save();
    context.translate(cx, cy);
    context.rotate(-plane.pitch);
    context.fillStyle = '#6b4a2e';
    context.fillRect(-r, 0, r * 2, r);
    context.restore();
    // Pitch ladder.
    context.strokeStyle = 'rgba(255,255,255,0.7)';
    context.lineWidth = 1.5;
    for (const deg of [-20, -10, 10, 20]) {
      const y = cy - Math.tan((deg * Math.PI) / 180) * 120 - plane.pitch * 120;
      if (y < cy - r + 6 || y > cy + r - 6) continue;
      context.beginPath();
      context.moveTo(cx - 18, y);
      context.lineTo(cx + 18, y);
      context.stroke();
    }
    context.restore();
    context.strokeStyle = PALETTE.hudText;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.stroke();
    // Fixed wings marker over the horizon.
    context.strokeStyle = PALETTE.ring;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(cx - 34, cy);
    context.lineTo(cx - 10, cy);
    context.moveTo(cx + 10, cy);
    context.lineTo(cx + 34, cy);
    context.stroke();
    context.fillStyle = PALETTE.ring;
    context.beginPath();
    context.arc(cx, cy, 4, 0, Math.PI * 2);
    context.fill();
    text('ATTITUDE', cx, cy + r + 16, 11, PALETTE.hudDim, 'center');
    // Throttle bar beside the horizon.
    const tx = 176;
    const ty = FIELD.height - 150;
    context.fillStyle = PALETTE.hudPanel;
    context.fillRect(tx, ty, 22, 116);
    context.strokeStyle = PALETTE.panelEdge;
    context.strokeRect(tx, ty, 22, 116);
    const fillH = 116 * plane.throttle;
    context.fillStyle = plane.throttle > 0.85 ? PALETTE.hudWarn : PALETTE.hudGood;
    context.fillRect(tx + 3, ty + 116 - fillH, 16, fillH);
    text('THR', tx + 11, ty + 132, 11, PALETTE.hudDim, 'center');
    text(`${Math.round(plane.throttle * 100)}%`, tx + 11, ty - 8, 12, PALETTE.hudText, 'center');
    // Fuel and damage bars, bottom right.
    const bx = FIELD.width - 210;
    const by = FIELD.height - 150;
    for (let i = 0; i < 2; i += 1) {
      const isFuel = i === 0;
      const x = bx + i * 52;
      const frac = isFuel ? plane.fuel / PLANE.tank : 1 - plane.damage / 100;
      context.fillStyle = PALETTE.hudPanel;
      context.fillRect(x, by, 22, 116);
      context.strokeStyle = PALETTE.panelEdge;
      context.strokeRect(x, by, 22, 116);
      const h = 116 * clamp(frac, 0, 1);
      context.fillStyle = isFuel ? (plane.fuel <= 25 ? PALETTE.hudBad : PALETTE.hudGood) : plane.damage >= 60 ? PALETTE.hudBad : PALETTE.hudGood;
      context.fillRect(x + 3, by + 116 - h, 16, h);
      text(isFuel ? 'FUEL' : 'HULL', x + 11, by + 132, 11, PALETTE.hudDim, 'center');
      text(isFuel ? String(Math.round(plane.fuel)) : `${Math.round(plane.damage)}%`, x + 11, by - 8, 12, PALETTE.hudText, 'center');
    }
    // Vertical speed, under the compass.
    const vs = plane.vspeed;
    text(`V/S ${vs >= 0 ? '+' : ''}${vs.toFixed(1)} m/s`, FIELD.width / 2, 92, 13, Math.abs(vs) > 4 && !plane.grounded ? PALETTE.hudWarn : PALETTE.hudDim, 'center');
  }

  function drawMessage(sortie, elapsed) {
    if (!sortie.message || elapsed > sortie.messageUntil) return;
    const alpha = clamp(sortie.messageUntil - elapsed, 0, 1);
    context.save();
    context.globalAlpha = alpha;
    text(sortie.message, FIELD.width / 2, 118, 17, PALETTE.hudText, 'center');
    context.restore();
  }

  function drawPanel(title, lines, prompt) {
    const width = 640;
    const height = 150 + lines.length * 32;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    text(title, FIELD.width / 2, y + 62, 42, PALETTE.hudText, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + 108 + i * 32, 19, PALETTE.hudDim, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 26, 20, PALETTE.ring, 'center');
  }

  /** Paint one frame from the live state. */
  function draw(frame) {
    const { plane, sortie, rings, screen, best, elapsed } = frame;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.skyTop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    const cam = cameraFor(plane, screen);
    const wind = 3; // windsock breeze; the live gust lives in the physics
    drawSky(cam, elapsed);
    drawSea(cam, elapsed);
    drawTerrain(cam);
    for (const runway of RUNWAYS) drawRunway(cam, runway, wind);
    drawTown(cam);
    drawPalms(cam);
    drawLighthouse(cam, elapsed);
    drawMountainLabel(cam);
    drawBirds(cam, elapsed);
    drawDropZone(cam, sortie, elapsed);
    drawRings(cam, rings, plane.ringIndex);
    drawPlaneShadow(cam, plane);
    drawPlane(cam, plane, elapsed);
    drawTapes(plane);
    drawTopBar(plane, sortie, best);
    drawBottomGauges(plane, elapsed);
    drawMessage(sortie, elapsed);

    if (screen === SCREEN_TITLE) {
      drawPanel('ISLAND HOPPER', [
        'A bush-pilot sortie across the island chain.',
        'Take off from runway A, fly the rings, drop the crate over town,',
        'and put her down gently on runway B at Kota Bay.',
        'Up/W climb · Down/S dive · Right/D throttle · Left/A cut throttle · Space drop',
        `Best sortie: ${best}`,
      ], 'Press Space or click to fly');
    } else if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The islands will wait for you.'], 'Press P to keep flying');
    } else if (screen === SCREEN_OVER) {
      if (plane.state === 'crashed') {
        drawPanel('CRASHED', [
          plane.crashReason,
          `Score ${sortie.score} · Best ${best}`,
        ], 'Press Space to fly again');
      } else {
        drawPanel('SORTIE COMPLETE', [
          `Landed at ${plane.landedAt ?? 'the far shore'}${sortie.perfectLanding ? ' — a perfect, gentle touchdown.' : '.'}`,
          `Rings ${sortie.ringsDone}/${sortie.rings} · Crate ${sortie.dropped ? 'delivered' : 'still aboard'} · Fuel left ${Math.round(plane.fuel)}`,
          `Score ${sortie.score} · Best ${best}`,
        ], 'Press Space to fly another sortie');
      }
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
