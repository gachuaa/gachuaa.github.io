import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

const markdownParser = unified().use(remarkParse).use(remarkGfm);
const colorMap = {
  1: '#fb464c',
  2: '#e9973f',
  3: '#e0de71',
  4: '#44cf6e',
  5: '#53dfdd',
  6: '#a882ff',
};
const imagePattern = /\.(?:avif|gif|jpe?g|png|svg|webp)(?:[?#]|$)/i;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function appendMarkdown(parent, node) {
  const appendChildren = (target) => node.children?.forEach((child) => appendMarkdown(target, child));
  if (node.type === 'root') return appendChildren(parent);
  if (node.type === 'text') return parent.append(document.createTextNode(node.value));
  if (node.type === 'html') return parent.append(document.createTextNode(node.value));
  if (node.type === 'break') return parent.append(document.createElement('br'));
  if (node.type === 'thematicBreak') return parent.append(document.createElement('hr'));
  if (node.type === 'code') {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = node.value;
    pre.append(code);
    return parent.append(pre);
  }
  if (node.type === 'image') {
    if (!/^(?:https?:\/\/|\/|\.\.?\/)/i.test(node.url || '')) return parent.append(document.createTextNode(node.alt || ''));
    const image = document.createElement('img');
    image.src = node.url;
    image.alt = node.alt || '';
    return parent.append(image);
  }
  if (node.type === 'link') {
    const link = document.createElement('a');
    if (/^(?:https?:\/\/|mailto:|\/|#|\.\.?\/)/i.test(node.url || '')) {
      link.href = node.url;
      if (/^https?:\/\//i.test(node.url)) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    }
    appendChildren(link);
    return parent.append(link);
  }
  if (node.type === 'list') {
    const list = document.createElement(node.ordered ? 'ol' : 'ul');
    if (node.ordered && node.start > 1) list.start = node.start;
    appendChildren(list);
    return parent.append(list);
  }
  if (node.type === 'table') {
    const table = document.createElement('table');
    node.children?.forEach((row, index) => {
      const tr = document.createElement('tr');
      row.children?.forEach((cell) => {
        const td = document.createElement(index === 0 ? 'th' : 'td');
        cell.children?.forEach((child) => appendMarkdown(td, child));
        tr.append(td);
      });
      table.append(tr);
    });
    return parent.append(table);
  }
  const tags = {
    blockquote: 'blockquote', delete: 'del', emphasis: 'em', heading: `h${Math.min(6, Math.max(1, node.depth || 2))}`,
    inlineCode: 'code', linkReference: 'span', listItem: 'li', paragraph: 'p', strong: 'strong',
  };
  const tag = tags[node.type];
  if (!tag) return appendChildren(parent);
  const child = document.createElement(tag);
  if (node.type === 'inlineCode') child.textContent = node.value;
  else appendChildren(child);
  parent.append(child);
}

function renderBoard(container, canvas) {
  const nodes = Array.isArray(canvas.nodes) ? canvas.nodes.filter((node) => node && typeof node === 'object') : [];
  const edges = Array.isArray(canvas.edges) ? canvas.edges : [];
  const positioned = nodes.map((node) => ({
    node,
    x: finite(node.x),
    y: finite(node.y),
    width: Math.max(24, finite(node.width, 240)),
    height: Math.max(24, finite(node.height, 140)),
  }));
  if (!positioned.length) {
    container.replaceChildren(element('div', 'canvas-empty', 'Empty Canvas'));
    return;
  }

  const minX = Math.min(0, ...positioned.map(({x}) => x));
  const minY = Math.min(0, ...positioned.map(({y}) => y));
  const maxX = Math.max(...positioned.map(({x,width}) => x + width));
  const maxY = Math.max(...positioned.map(({y,height}) => y + height));
  const padding = 48;
  const width = Math.max(320, maxX - minX + padding * 2);
  const height = Math.max(220, maxY - minY + padding * 2);
  const offsetX = padding - minX;
  const offsetY = padding - minY;

  container.replaceChildren();
  const toolbar = element('div', 'canvas-toolbar');
  const zoomOut = element('button', 'canvas-tool', '−');
  zoomOut.type = 'button';
  zoomOut.title = 'Zoom out';
  zoomOut.setAttribute('aria-label', 'Zoom out Canvas');
  const zoomLabel = element('span', 'canvas-zoom-label', '100%');
  const zoomIn = element('button', 'canvas-tool', '+');
  zoomIn.type = 'button';
  zoomIn.title = 'Zoom in';
  zoomIn.setAttribute('aria-label', 'Zoom in Canvas');
  const fitButton = element('button', 'canvas-tool canvas-fit', 'Fit');
  fitButton.type = 'button';
  fitButton.title = 'Fit Canvas to view';
  fitButton.setAttribute('aria-label', 'Fit Canvas to view');
  toolbar.append(zoomOut, zoomLabel, zoomIn, fitButton);

  const viewport = element('div', 'canvas-viewport');
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-label', 'Obsidian Canvas board');
  const stageHost = element('div', 'canvas-stage-host');
  const stage = element('div', 'canvas-stage');
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  stage.style.setProperty('--canvas-width', `${width}px`);
  stage.style.setProperty('--canvas-height', `${height}px`);
  stageHost.append(stage);
  viewport.append(stageHost);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('canvas-edges');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('aria-hidden', 'true');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', `canvas-arrow-${Math.random().toString(36).slice(2)}`);
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '7');
  marker.setAttribute('markerHeight', '7');
  marker.setAttribute('orient', 'auto-start-reverse');
  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
  arrow.setAttribute('fill', 'context-stroke');
  marker.append(arrow);
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.append(marker);
  svg.append(defs);

  const byId = new Map(positioned.map((item) => [item.node.id, item]));
  const getPoint = (item, side) => {
    const x = item.x + offsetX;
    const y = item.y + offsetY;
    if (side === 'left') return {x, y: y + item.height / 2};
    if (side === 'right') return {x: x + item.width, y: y + item.height / 2};
    if (side === 'top') return {x: x + item.width / 2, y};
    if (side === 'bottom') return {x: x + item.width / 2, y: y + item.height};
    return {x: x + item.width / 2, y: y + item.height / 2};
  };
  for (const edge of edges) {
    const from = byId.get(edge?.fromNode);
    const to = byId.get(edge?.toNode);
    if (!from || !to) continue;
    const start = getPoint(from, edge.fromSide);
    const end = getPoint(to, edge.toSide);
    const curve = Math.max(36, Math.hypot(end.x - start.x, end.y - start.y) * .36);
    const c1 = {...start}, c2 = {...end};
    if (edge.fromSide === 'left') c1.x -= curve;
    else if (edge.fromSide === 'right') c1.x += curve;
    else if (edge.fromSide === 'top') c1.y -= curve;
    else if (edge.fromSide === 'bottom') c1.y += curve;
    else c1.x += curve;
    if (edge.toSide === 'left') c2.x -= curve;
    else if (edge.toSide === 'right') c2.x += curve;
    else if (edge.toSide === 'top') c2.y -= curve;
    else if (edge.toSide === 'bottom') c2.y += curve;
    else c2.x -= curve;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', colorMap[edge.color] || 'currentColor');
    path.setAttribute('stroke-width', '2');
    if (edge.toEnd && edge.toEnd !== 'none') path.setAttribute('marker-end', `url(#${marker.id})`);
    if (edge.fromEnd && edge.fromEnd !== 'none') path.setAttribute('marker-start', `url(#${marker.id})`);
    svg.append(path);
  }
  stage.append(svg);

  const ordered = [...positioned].sort((a,b) => Number(a.node.type !== 'group') - Number(b.node.type !== 'group'));
  for (const item of ordered) {
    const {node,x,y,width:nodeWidth,height:nodeHeight} = item;
    const card = element('div', `canvas-node canvas-node-${node.type || 'text'}${node.color ? ` canvas-color-${node.color}` : ''}`);
    card.style.left = `${x + offsetX}px`;
    card.style.top = `${y + offsetY}px`;
    card.style.width = `${nodeWidth}px`;
    card.style.height = `${nodeHeight}px`;
    if (node.type === 'group') {
      card.setAttribute('aria-label', node.label || 'Group');
      if (node.label) card.append(element('span', 'canvas-group-label', node.label));
    } else if (node.type === 'text') {
      const text = element('div', 'canvas-node-text canvas-markdown');
      try { appendMarkdown(text, markdownParser.parse(node.text || '')); }
      catch { text.textContent = node.text || ''; }
      card.append(text);
    } else if (node.type === 'link') {
      const link = element('a', 'canvas-node-link', node.label || node.url || 'Open link');
      if (/^https?:\/\//i.test(node.url || '')) {
        link.href = node.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      card.append(link);
    } else if (node.type === 'file') {
      if (imagePattern.test(node.file || '')) {
        const image = document.createElement('img');
        image.src = node.file;
        image.alt = node.file.split('/').pop() || 'Canvas image';
        image.loading = 'lazy';
        card.append(image);
      } else {
        const link = element('a', 'canvas-node-link', node.file?.split('/').pop() || 'Open file');
        if (node.file) {
          link.href = node.file;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        }
        card.append(link);
      }
    }
    stage.append(card);
  }

  container.append(toolbar, viewport);
  let scale = 1;
  const applyScale = () => {
    stage.style.transform = `scale(${scale})`;
    stageHost.style.width = `${width * scale}px`;
    stageHost.style.height = `${height * scale}px`;
    zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  };
  const fit = () => {
    const availableWidth=viewport.clientWidth-24,availableHeight=viewport.clientHeight-24;
    if(availableWidth<=0||availableHeight<=0)return;
    scale = Math.max(.05,Math.min(1,availableWidth/width,availableHeight/height));
    applyScale();
    viewport.scrollTo({left:0,top:0});
  };
  const zoomAt=(nextScale,clientX,clientY)=>{
    const previousScale=scale;
    scale=Math.max(.05,Math.min(2.5,nextScale));
    const bounds=viewport.getBoundingClientRect(),pointerX=clientX-bounds.left,pointerY=clientY-bounds.top;
    const originX=stageHost.offsetLeft,originY=stageHost.offsetTop;
    const stageX=(viewport.scrollLeft+pointerX-originX)/previousScale;
    const stageY=(viewport.scrollTop+pointerY-originY)/previousScale;
    applyScale();
    viewport.scrollLeft=Math.max(0,originX+stageX*scale-pointerX);
    viewport.scrollTop=Math.max(0,originY+stageY*scale-pointerY);
  };
  const zoomBy=factor=>{
    const bounds=viewport.getBoundingClientRect();
    zoomAt(scale*factor,bounds.left+viewport.clientWidth/2,bounds.top+viewport.clientHeight/2);
  };
  const article=container.closest('[data-entry-views]')?.querySelector('.reading-article');
  const alignToolbar=()=>{
    if(!article)return;
    const canvasBounds=container.getBoundingClientRect(),articleBounds=article.getBoundingClientRect();
    toolbar.style.width=`${articleBounds.width}px`;
    toolbar.style.marginLeft=`${Math.max(0,articleBounds.left-canvasBounds.left)}px`;
  };
  const fitAndAlign=()=>{fit();alignToolbar();};
  zoomOut.addEventListener('click', () => zoomBy(1/1.2));
  zoomIn.addEventListener('click', () => zoomBy(1.2));
  fitButton.addEventListener('click', fitAndAlign);
  viewport.addEventListener('wheel',event=>{
    if(viewport.classList.contains('is-panning')){event.preventDefault();return;}
    if(event.target instanceof Element&&event.target.closest('.canvas-node-text'))return;
    event.preventDefault();
    const delta=event.deltaY||event.deltaX;
    zoomAt(scale*Math.exp(-delta*.0015),event.clientX,event.clientY);
  },{passive:false});
  let pan;
  viewport.addEventListener('pointerdown',event=>{
    const target=event.target instanceof Element?event.target:null;
    if(event.button!==0||target?.closest('a,button,input,textarea,select'))return;
    const bounds=viewport.getBoundingClientRect();
    const verticalScrollbar=viewport.offsetWidth-viewport.clientWidth;
    const horizontalScrollbar=viewport.offsetHeight-viewport.clientHeight;
    if(target===viewport&&((verticalScrollbar>0&&event.clientX>=bounds.right-verticalScrollbar)||(horizontalScrollbar>0&&event.clientY>=bounds.bottom-horizontalScrollbar)))return;
    pan={pointerId:event.pointerId,x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop,started:false};
  });
  window.addEventListener('pointermove',event=>{
    if(!pan||event.pointerId!==pan.pointerId)return;
    const deltaX=event.clientX-pan.x,deltaY=event.clientY-pan.y;
    if(!pan.started&&Math.hypot(deltaX,deltaY)<4)return;
    if(!pan.started){
      pan.started=true;
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('is-panning');
      window.getSelection()?.removeAllRanges();
    }
    event.preventDefault();
    viewport.scrollLeft=pan.left-deltaX;
    viewport.scrollTop=pan.top-deltaY;
  });
  const stopPan=event=>{
    if(!pan||event.pointerId!==pan.pointerId)return;
    if(pan.started&&viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);
    pan=undefined;viewport.classList.remove('is-panning');
  };
  window.addEventListener('pointerup',stopPan);
  window.addEventListener('pointercancel',stopPan);
  container.addEventListener('entry-view-shown',fitAndAlign);
  if('ResizeObserver' in window){const observer=new ResizeObserver(fitAndAlign);observer.observe(container);if(article)observer.observe(article);}
  requestAnimationFrame(fitAndAlign);
}

for (const container of document.querySelectorAll('.canvas-board[data-canvas-src]')) {
  fetch(container.dataset.canvasSrc)
    .then((response) => {
      if (!response.ok) throw new Error(`Canvas request failed (${response.status}).`);
      return response.json();
    })
    .then((canvas) => renderBoard(container, canvas))
    .catch((error) => {
      container.textContent = `Canvas could not be loaded: ${error.message}`;
      container.classList.add('canvas-error');
    });
}
