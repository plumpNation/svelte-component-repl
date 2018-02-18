// @ts-check

/** @type {HTMLTextAreaElement} */
const target = document.querySelector('#code-editor-mount');

/** @type {HTMLElement} */
const output = document.querySelector('#output');

const customComponentNames = [
    '<MyComponent',
    '<YourComponent'
];

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
    autoCloseTags: true,
    showTrailingSpace: true
};

// We need to provide a list of tags in the autocomplete.
const originalHTMLHint = CodeMirror.hint.html;

// All we really do in this override, is to add our custom components to the
// HTML autocomplete list.
CodeMirror.hint.html = function(cm) {
    const inner = originalHTMLHint(cm) || {from: cm.getCursor(), to: cm.getCursor(), list: []};

    inner.list.unshift.apply(inner.list, customComponentNames);

    return inner;
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
