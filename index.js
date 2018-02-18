// @ts-check

/** @type {HTMLTextAreaElement} */
const target = document.querySelector('#code-editor-mount');

/** @type {HTMLElement} */
const output = document.querySelector('#output');

/** @type {string} */
// Default content to render.
target.value = `<style>
.jeff {
     color: red;
}
</style>

<h1 class="jeff">A header</h1>`;

/** @type {CodeMirror.EditorConfiguration} */
const codeMirrorConfig = {
    extraKeys: {'Ctrl-Space': 'autocomplete'},
    lineNumbers: true,
    mode:  'text/html',
    value: target.value,
    autoCloseTags: true
};

/** @type {CodeMirror.Editor} */
const codeMirror = CodeMirror(mountReplace(target), codeMirrorConfig);

codeMirror.on('change', onChange(output));

render(output)(codeMirror);

// /////////////////////////////////////////////////////////////////////////////////////////////////
// /////////////////////////////////////////////////////////////////////////////////////////////////
// /////////////////////////////////////////////////////////////////////////////////////////////////

function onChange(output) {
    return _.throttle(render(output), 500);
}

function render(output) {
    return editor => {
        output.innerHTML = editor.doc.getValue();
    };
}

/**
 * Removes original mount element from DOM.
 *
 * @param {HTMLTextAreaElement} target
 * @returns {(HTMLElement) => void}
 */
function mountReplace(target) {
    /**
     * @param {HTMLElement} elt
     * @returns {void}
     */
    return elt => {
        target.parentNode.replaceChild(elt, target);
    };
}
