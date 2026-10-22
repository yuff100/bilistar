// 扩展自有 UI 的共享样式表:由渲染代码注入 <style id="follows-only-ui">,
// 保持 content.js 单文件打包,不在 manifest 里挂独立 css。
// 选择器只命中扩展自己渲染的节点(#follows-root / #follows-login /
// 注入的观看页挂件),不碰 B 站原生播放器与评论区。

export const UI_STYLE_ID = "follows-only-ui";

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif';

const HOME_CSS = [
  `#follows-root{position:fixed;inset:0;display:flex;background:#f6f7f8;color:#18191c;font-size:14px;line-height:1.5;font-family:${FONT_STACK}}`,
  `#follows-root *{box-sizing:border-box}`,
  `#follows-root [hidden]{display:none}`,
  `#follows-root>nav{width:200px;flex:none;height:100%;overflow-y:auto;background:#fff;border-right:1px solid #e3e5e7;padding:16px 12px}`,
  `#follows-root>nav>header{display:flex;align-items:center;justify-content:space-between;margin:0 8px 12px}`,
  `#follows-root>nav h1{margin:0;font-size:16px;font-weight:700;color:#18191c}`,
  `#follows-root>nav ul{list-style:none;margin:0;padding:0}`,
  `#follows-root>nav li[data-follows]{padding:8px 10px;margin-bottom:4px;border-radius:6px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#18191c}`,
  `#follows-root>nav li[data-follows-mid]{padding:8px 10px;margin-bottom:4px;border-radius:6px;cursor:pointer;white-space:nowrap;color:#18191c;display:flex;align-items:center;gap:4px;position:relative}`,
  `#follows-root>nav li[data-follows-mid][hidden]{display:none}`,
  `#follows-root>nav li[data-follows]:hover,#follows-root>nav li[data-follows-mid]:hover{background:#f6f7f8}`,
  `#follows-root>nav li[aria-current]{background:#fff0f4;color:#fb7299;font-weight:600}`,
  `#follows-root>nav li[aria-current]:hover{background:#fff0f4}`,
  `#follows-root>nav li[data-group-id]{display:flex;align-items:center;gap:4px;padding:12px 10px 2px;font-size:12px;color:#9499a0;cursor:pointer;white-space:nowrap}`,
  `#follows-root>nav li[data-group-id]>span{min-width:0;overflow:hidden;text-overflow:ellipsis}`,
  `#follows-root>nav li[data-group-id]:hover{color:#18191c}`,
  `#follows-root>nav li[data-group-id][aria-current]{color:#fb7299;font-weight:600}`,
  `#follows-root [data-group-toggle]{flex:none;width:16px;height:16px;padding:0;border:none;border-radius:4px;background:transparent;color:#9499a0;font-size:10px;line-height:1;cursor:pointer}`,
  `#follows-root [data-group-toggle]::after{content:"▾"}`,
  `#follows-root [data-group-toggle][aria-expanded="false"]::after{content:"▸"}`,
  `#follows-root [data-group-toggle]:hover{color:#fb7299;background:#fff0f4}`,
  `#follows-root>nav li[draggable="true"]{cursor:grab}`,
  `#follows-root>nav li[data-drag-over]{outline:1px dashed #fb7299}`,
  `#follows-root>nav li[data-follows-mid]>span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
  `#follows-root [data-group-edit]{flex:none;width:20px;height:20px;padding:0;border:none;border-radius:4px;background:transparent;color:#9499a0;font-size:12px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:0}`,
  `#follows-root [data-group-edit]::after{content:"✎"}`,
  `#follows-root>nav li[data-follows-mid]:hover [data-group-edit],#follows-root>nav li[data-follows-mid]:focus-within [data-group-edit],#follows-root [data-group-edit]:focus{opacity:1}`,
  `#follows-root [data-group-edit]:hover{color:#fb7299;background:#fff0f4}`,
  `#follows-root [data-group-picker]{position:absolute;top:100%;right:0;z-index:10;width:max-content;max-width:100%;max-height:240px;overflow-y:auto;padding:4px;display:flex;flex-direction:column;gap:2px;border:1px solid #e3e5e7;border-radius:8px;background:#fff;box-shadow:0 4px 12px rgba(0,0,0,.12)}`,
  `#follows-root [data-group-picker] button{padding:6px 10px;border:none;border-radius:6px;background:transparent;color:#18191c;font-size:13px;text-align:left;cursor:pointer;white-space:nowrap}`,
  `#follows-root [data-group-picker] button:hover{background:#f6f7f8;color:#fb7299}`,
  `#follows-root [data-group-picker] button[aria-current]{color:#fb7299;font-weight:600}`,
  `#follows-root [data-group-error]{flex:none;color:#f25d8e;font-size:12px}`,
  `#follows-root [data-action="collapse-left"],#follows-root [data-action="collapse-mid"]{flex:none;width:22px;height:22px;margin:0;padding:0;border:1px solid #e3e5e7;border-radius:6px;background:#fff;color:#9499a0;font-size:13px;line-height:1;cursor:pointer}`,
  `#follows-root [data-action="collapse-left"]:hover,#follows-root [data-action="collapse-mid"]:hover{color:#fb7299;border-color:#fb7299}`,
  `#follows-root>button[data-action="restore-left"],#follows-root>button[data-action="restore-mid"]{width:20px;flex:none;padding:0;border:none;background:#fff;color:#fb7299;font-size:14px;cursor:pointer}`,
  `#follows-root>button[data-action="restore-left"]{border-right:1px solid #e3e5e7}`,
  `#follows-root>button[data-action="restore-mid"]{border-left:1px solid #e3e5e7}`,
  `#follows-root>button[data-action="restore-left"]:hover,#follows-root>button[data-action="restore-mid"]:hover{background:#fff0f4}`,
  `#follows-root>main{flex:0 1 380px;max-width:380px;min-width:0;height:100%;overflow-y:auto;padding:20px 24px}`,
  `#follows-root>main>header{display:flex;justify-content:flex-end;margin-bottom:8px}`,
  `#follows-root main nav{display:flex;gap:8px;margin-bottom:16px}`,
  `#follows-root main nav a{display:inline-block;padding:4px 12px;border-radius:999px;background:#fff;border:1px solid #e3e5e7;color:#61666d;font-size:13px;text-decoration:none}`,
  `#follows-root main nav a:hover{color:#fb7299;border-color:#fb7299}`,
  `#follows-root main ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px;max-width:100%}`,
  `#follows-root li[data-bvid]{background:#fff;border:1px solid #e3e5e7;border-radius:8px;padding:14px 16px;cursor:pointer;transition:box-shadow .15s ease}`,
  `#follows-root li[data-bvid]:hover{box-shadow:0 4px 12px rgba(0,0,0,.08)}`,
  `#follows-root li[data-bvid] h2{margin:0 0 6px;font-size:15px;font-weight:600;color:#18191c}`,
  `#follows-root li[data-bvid] span{margin-right:8px;color:#9499a0;font-size:13px}`,
  `#follows-root li[data-bvid] time{color:#9499a0;font-size:12px}`,
  `#follows-root main p{margin:0;padding:24px 0;color:#9499a0}`,
  `#follows-root main button{margin-top:16px;padding:8px 20px;border-radius:999px;border:1px solid #e3e5e7;background:#fff;color:#61666d;font-size:14px;cursor:pointer}`,
  `#follows-root main button:hover{color:#fb7299;border-color:#fb7299}`,
  `#follows-root>aside{flex:1;min-width:480px;height:100%;overflow-y:auto;background:#fff;border-left:1px solid #e3e5e7;padding:16px;display:flex;flex-direction:column;gap:12px}`,
  `#follows-root>aside iframe{width:100%;aspect-ratio:16/9;border:none;border-radius:8px;background:#000}`,
  `#follows-root>aside h2{margin:0;font-size:15px;font-weight:600;color:#18191c}`,
  `#follows-root>aside p{margin:0;padding:24px 0;color:#9499a0}`,
  `#follows-root>aside a{display:inline-block;align-self:flex-start;padding:6px 16px;border-radius:999px;background:#fb7299;color:#fff;text-decoration:none;font-size:13px}`,
  `#follows-root>aside a:hover{background:#fc8bab}`,
].join("");

const LOGIN_CSS = [
  `#follows-login{position:fixed;inset:0;margin:auto;width:320px;height:180px;display:flex;align-items:center;justify-content:center;background:#fff;border:1px solid #e3e5e7;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.08);font-family:${FONT_STACK}}`,
  `#follows-login a{display:inline-block;background:#fb7299;color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:16px;font-weight:600;box-shadow:0 4px 12px rgba(251,114,153,.35)}`,
  `#follows-login a:hover{background:#fc8bab}`,
].join("");

const WATCH_CSS = [
  `a[data-action="back-home"]{position:fixed;top:12px;left:12px;z-index:100001;display:inline-block;background:#fff;color:#fb7299;font-weight:600;font-size:13px;text-decoration:none;padding:6px 14px;border-radius:999px;border:1px solid #e3e5e7;box-shadow:0 2px 8px rgba(0,0,0,.12);font-family:${FONT_STACK}}`,
  `a[data-action="back-home"]:hover{background:#fff0f4}`,
  `#follows-up-videos{position:fixed;top:72px;right:16px;width:320px;max-height:calc(100vh - 96px);overflow-y:auto;background:#f6f7f8;border:1px solid #e3e5e7;border-radius:8px;padding:12px;box-sizing:border-box;z-index:100000;color:#18191c;font-size:14px;line-height:1.5;font-family:${FONT_STACK}}`,
  `#follows-up-videos ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}`,
  `#follows-up-videos li{background:#fff;border:1px solid #e3e5e7;border-radius:8px}`,
  `#follows-up-videos a{display:block;padding:10px 12px;color:#18191c;text-decoration:none;font-size:13px;border-radius:8px}`,
  `#follows-up-videos a:hover{color:#fb7299}`,
  `button[data-action="follow"]{position:fixed;right:24px;bottom:24px;z-index:100001;background:#fb7299;color:#fff;border:none;border-radius:8px;padding:10px 24px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(251,114,153,.4);font-family:${FONT_STACK}}`,
  `button[data-action="follow"]:hover{background:#fc8bab}`,
  `[data-role="follow-error"]{position:fixed;right:24px;bottom:78px;z-index:100001;background:#fff0f4;color:#f25d8e;border:1px solid #fb7299;border-radius:6px;padding:6px 12px;font-size:13px;font-family:${FONT_STACK}}`,
].join("");

export const UI_CSS = `${HOME_CSS}${LOGIN_CSS}${WATCH_CSS}`;

/** 幂等:同一文档只注入一次,重复渲染/MutationObserver 重放都安全。 */
export function ensureUiStyle(document: Document): void {
  if (document.getElementById(UI_STYLE_ID) !== null) {
    return;
  }
  const style = document.createElement("style");
  style.id = UI_STYLE_ID;
  style.textContent = UI_CSS;
  (document.head ?? document.documentElement).appendChild(style);
}
