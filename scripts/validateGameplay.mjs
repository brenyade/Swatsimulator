import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WEAPONS } from '../src/core/Weapons.js';
import { CareerManager } from '../src/core/CareerManager.js';
import { Entity } from '../src/entities/Entity.js';
import { CAREER_MISSIONS } from '../src/maps/mapData.js';
import { isSolidTile } from '../src/engine/utils.js';
import { Player } from '../src/entities/Player.js';
import { Suspect } from '../src/entities/Suspect.js';
import { ScoreManager } from '../src/core/ScoreManager.js';

assert.equal(CAREER_MISSIONS.length, 6, 'career should contain six missions');
assert.equal(CAREER_MISSIONS.at(-1).id, 'm6', 'the new dock mission should close the campaign');
assert.equal(CAREER_MISSIONS.at(-1).loadout.lethal, 'm4', 'mission six should issue the M4A1');

assert.ok(WEAPONS.m4, 'M4A1 weapon definition should exist');
assert.equal(WEAPONS.m4.automatic, true, 'M4A1 should support automatic fire');
assert.equal(WEAPONS.m9.automatic, undefined, 'M9 should remain semi-automatic');

const actor = new Entity(0, 0);
actor.stun(1.5);
assert.equal(actor.tickStun(0.5), true, 'stunned actors should skip their update');
assert.equal(actor.stunTimer, 1, 'stun duration should count down');
actor.tickStun(1);
assert.equal(actor.stunTimer, 0, 'stun should expire instead of becoming permanent');

const career = new CareerManager();
career.recordResult(5, { grade: 'A', score: 82 });
assert.equal(career.data.unlockedIndex, 6, 'career progression should advance beyond mission five');

const closedDoorMap = { width: 1, height: 1, grid: [['D']], openDoors: new Set() };
assert.equal(isSolidTile(closedDoorMap, 0, 0, { forMovement: true }), true, 'closed doors should block bodies');
assert.equal(isSolidTile(closedDoorMap, 0, 0), false, 'AI pathfinding should still plan through a closed door');
closedDoorMap.openDoors.add('0,0');
assert.equal(isSolidTile(closedDoorMap, 0, 0, { forMovement: true }), false, 'opened doors should clear movement');

const armoredPlayer = new Player(0, 0, { lethal: 'm9', nonlethal: 'taser' });
armoredPlayer.takeDamage(20);
assert.ok(armoredPlayer.armor < armoredPlayer.maxArmor, 'incoming fire should damage armor');
assert.ok(armoredPlayer.hp > 80, 'armor should absorb part of incoming damage');

const pressuredSuspect = new Suspect({ x: 0, y: 0, armed: true, willSurrender: 0.7, morale: 0.55 });
const commandMission = { banner() {} };
for (let i = 0; i < 5 && pressuredSuspect.state !== 'surrendering'; i++) pressuredSuspect.receiveCommand(0.35, commandMission);
assert.equal(pressuredSuspect.state, 'surrendering', 'repeated lawful commands should build toward compliance');

const score = new ScoreManager();
assert.equal(score.recordForceViolation({ id: 42 }), true, 'first ROE violation should be recorded');
assert.equal(score.recordForceViolation({ id: 42 }), false, 'repeat hits on one target should not duplicate the event');
assert.equal(score.forceViolations, 1, 'ROE violation count should be target-based');

for (const mission of CAREER_MISSIONS) {
  assert.ok((mission.props || []).length >= 3, `${mission.id} should contain semantic furniture or cover`);
  assert.ok((mission.surfaces || []).length >= 2, `${mission.id} should define architectural surface zones`);
  const doors = mission.grid.flat().filter((cell) => cell === 'D').length;
  assert.ok(doors >= 2, `${mission.id} should provide multiple tactical doorways or entries`);
}

const modelLibrary = fs.readFileSync(new URL('../src/engine/ModelLibrary.js', import.meta.url), 'utf8');
assert.doesNotMatch(modelLibrary, /https?:\/\//, 'the runtime model pipeline should not require a CDN');
assert.doesNotMatch(modelLibrary, /vendor\/(FBXLoader|OBJLoader|MTLLoader)\.js/, 'the model pipeline should not depend on removed loaders');
assert.match(modelLibrary, /export function spawnDoorModel/, 'the wooden door should be exposed by the model library');
assert.match(modelLibrary, /weaponId === 'm9'/, 'the sidearm should have its own procedural weapon shape');

const renderer = fs.readFileSync(new URL('../src/engine/Renderer3D.js', import.meta.url), 'utf8');
assert.match(renderer, /spawnDoorModel\(\)/, 'the scene renderer should instantiate the wooden door model');
assert.match(renderer, /hinge\.rotation\.y/, 'the door leaf should animate around its hinge');
assert.match(renderer, /resizeToDisplaySize/, 'the 3D renderer should respond to the visible canvas size');
assert.match(renderer, /const holder = new THREE\.Group\(\)/, 'weapon transforms should use holders instead of overwriting imported scale');

const styles = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
assert.match(styles, /#game-canvas[\s\S]*width:\s*100%[\s\S]*height:\s*100%/, 'the game canvas should fill the viewport');
const main = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
assert.match(main, /requestFullscreen/, 'the game should expose native fullscreen mode');

console.log('GAMEPLAY AND CONTENT VALID');
