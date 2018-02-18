// @ts-check

/** @type {HTMLTextAreaElement} */
const target = document.querySelector('#code-editor');

/** @type {CodeMirror.EditorConfiguration} */
const codeMirrorConfig = {
    value: target.value + '\n',
    lineNumbers: true,
    mode:  'htmlmixed'
};

/** @type {CodeMirror.Editor} */
const codeMirror = CodeMirror(mountReplace(target), codeMirrorConfig);

codeMirror.on('change', () => {
    console.log('changed');
});

// /////////////////////////////////////////////////////////////////////////////////////////////////
// /////////////////////////////////////////////////////////////////////////////////////////////////
// /////////////////////////////////////////////////////////////////////////////////////////////////

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
    return function (elt) {
        target.parentNode.replaceChild(elt, target);
    };
}
