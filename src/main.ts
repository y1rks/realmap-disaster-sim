import Phaser from 'phaser';
import './style.css';
import { MapScene } from './game/MapScene';
import { bindTouchControls } from './input-state';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#dce7dc',
  antialias: true,
  pixelArt: false,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
  },
  scene: [MapScene],
  render: { powerPreference: 'high-performance' },
});

const statusText = document.querySelector<HTMLElement>('#status-text')!;
const statusLight = document.querySelector<HTMLElement>('#status-light')!;
const objectiveText = document.querySelector<HTMLElement>('#objective-text')!;
const clock = document.querySelector<HTMLElement>('#clock')!;
const progressBar = document.querySelector<HTMLElement>('#progress-bar')!;
const eventBanner = document.querySelector<HTMLElement>('#event-banner')!;
const resultPanel = document.querySelector<HTMLElement>('#result-panel')!;
const resultSummary = document.querySelector<HTMLElement>('#result-summary')!;
const helpDialog = document.querySelector<HTMLDialogElement>('#help-dialog')!;

game.events.on('clock', (seconds: number) => {
  clock.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
});

game.events.on('quake', () => {
  statusText.textContent = '地震発生・避難中';
  statusLight.classList.add('danger');
  objectiveText.textContent = '緑色の一時避難地点へ移動';
  eventBanner.classList.add('visible');
  window.setTimeout(() => eventBanner.classList.remove('visible'), 3600);
});

game.events.on('progress', ({ progress, distance }: { progress: number; distance: number }) => {
  progressBar.style.width = `${Math.max(3, progress * 100)}%`;
  objectiveText.textContent = `避難地点まで 約${distance} m`;
});

game.events.on('complete', (seconds: number) => {
  statusText.textContent = '避難完了';
  statusLight.classList.remove('danger');
  statusLight.classList.add('safe');
  objectiveText.textContent = '安全な地点に到着しました';
  progressBar.style.width = '100%';
  resultSummary.textContent = `${Math.floor(seconds / 60)}分${seconds % 60}秒で避難地点に到着しました。`;
  resultPanel.classList.remove('hidden');
});

document.querySelector('#restart-button')?.addEventListener('click', () => window.location.reload());
document.querySelector('#help-button')?.addEventListener('click', () => helpDialog.showModal());
document.querySelector('#close-help')?.addEventListener('click', () => helpDialog.close());
document.querySelector('#start-button')?.addEventListener('click', () => helpDialog.close());

bindTouchControls();
