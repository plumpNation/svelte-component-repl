// @ts-check

const store = {};

/** @type {HTMLTextAreaElement} */
const textarea = document.querySelector('#code-editor-mount');

/** @type {HTMLElement} */
const output = document.querySelector('#output');

const componentsConfig = [
    {
        name: 'MyComponent',
        type: 'svelte',
        source: '<h1>I am a svelte MyComponent</h1>'
    },
    {
        name: 'YourComponent',
        type: 'svelte',
        source: '<h1>I am a svelte YourComponent</h1>'
    }
];

const components = compileComponents(componentsConfig);

/** @type {string} */
// Default content to render.
textarea.value = `<style>
.foobar,
MyComponent h1 {
     color: red;
}
</style>

<h1 class="foobar">Dummy data</h1>

<MyComponent></MyComponent>
`;

/** @type {CodeMirror.EditorConfiguration} */
const codeMirrorConfig = {
    extraKeys: {
        'Ctrl-Space': 'autocomplete',
        '"<"': 'autocomplete'
    },
    lineNumbers: true,
    mode: 'text/html',
    value: textarea.value,
    autoCloseTags: true,
    showTrailingSpace: true,
    theme: 'ambiance'
};

// ///////////////////////////////////////// HINTING ///////////////////////////////////////////////

// We need to provide a list of tags in the autocomplete.
const originalHTMLHint = CodeMirror.hint.html;

// All we really do in this override, is to add our custom components to the
// HTML autocomplete list.
CodeMirror.hint.html = function(cm) {
    const componentNames = components.map(component => '<' + component.name);
    const inner = originalHTMLHint(cm) || {from: cm.getCursor(), to: cm.getCursor(), list: []};

    inner.list.unshift.apply(inner.list, componentNames);

    return inner;
};

function completeAfter(cm, pred) {
    var cur = cm.getCursor();

    if (!pred || pred()) {
        setTimeout(function() {
            if (!cm.state.completionActive) {
                cm.showHint({completeSingle: false});
            }
        }, 100);
    }

    return CodeMirror.Pass;
  }

function completeIfAfterLt(cm) {
    return completeAfter(cm, function () {
        var cur = cm.getCursor();

        return cm.getRange(CodeMirror.Pos(cur.line, cur.ch - 1), cur) === '<';
    });
}

/** @type {CodeMirror.Editor} */
const codeMirror = CodeMirror(mountReplace(textarea), codeMirrorConfig);

codeMirror.on('change', onChange(output));

render(output)(codeMirror);

updateBundle(components);

// /////////////////////////////////////////////////////////////////////////////////////////////////
// /////////////////////////////////////////////////////////////////////////////////////////////////
// /////////////////////////////////////////////////////////////////////////////////////////////////

/**
 *
 * @param {*} component Svelte compiler output for a component.
 */
function printWarnings(component) {
    const w = component.warnings.length;

    if (!w) {
        return;
    }

    console.group(`${component.name}.${component.type}: ${w} ${w === 1 ? 'warning' : 'warnings'}`);

    component.warnings.forEach(warning => {
        console.warn(warning.message);
        console.log(warning.frame);
    });

    console.groupEnd();
}

function compileComponents(components) {
    return components.map(component => {
        const compiled = compileComponent(component);

        printWarnings(compiled);

        return {...compiled, ...component};
    });
}

function compileComponent(component) {
    const warnings = [];

    if (component.type === 'js') {
        return {
            code: component.source,
            map: null,
            warnings
        };
    }

    const { js } = svelte.compile(component.source || '', {
        cascade: false,
        name: component.name,
        filename: component.name + '.svelte',
        onwarn: warning => {
            warnings.push(warning);
        }
    });

    return { ...js, warnings };
}

function onChange(output) {
    return _.throttle(render(output), 500);
}

function render(output) {
    return editor => {
        let markup = '';

        if (store.bundle) {
            markup += `<script>
                ${store.bundle.code}

                store.target = document.querySelector('MyComponent');

                new MyComponent({target: store.target});
            </script>`;
        }

        markup += editor.doc.getValue();

        // not great
        output.innerHTML = markup;

        const scriptTags = output.getElementsByTagName('script');

        [].forEach.call(scriptTags, scriptTag => {
            eval(scriptTag.text);
        });
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

function updateBundle(components) {
    if (!components || !components.length) {
        console.info('no components to bundle');

        return;
    }

    if (components.some(c => !c.code)) {
        console.warn('uncompiled components found');

        return;
    }

    console.log(`running Svelte compiler version %c${svelte.VERSION}`, 'font-weight: bold');

    if (window.bundlePromise) {
        window.bundlePromise.cancel();
    }

    const lookup = {};

    components.forEach(component => {
        const path = `./${component.name}.${component.type}`;

        if (path in lookup) {
            throw new TypeError(`Multiple ${component.name}.${component.type} components`);
        }

        lookup[path] = component;
    });

    let cancelled = false;

    let uid = 1;
    const importMap = new Map();

    // here we can move between different entry points
    const input = './MyComponent.svelte';

    window.bundlePromise = rollup.rollup({
        input,

        external: id => id[0] !== '.',

        plugins: [{
            resolveId(importee, importer) {
                if (importee[0] === '.') return importee;
            },
            load(id) {
                if (id in lookup) {
                    // {code, map}
                    return lookup[id];
                }

                if (id[0] === '.') {
                    throw new Error(`file does not exist`);
                }

                return null;
            }
        }],
        onwarn(warning) {
            if (warning.code === 'MISSING_GLOBAL_NAME') return;

            console.warn(warning.message);
        }
    })
    .then(bundle => {
        if (cancelled) return;

        return bundle.generate({
            format: 'iife',
            name: 'MyComponent',
            globals: id => {
                const name = `import_${uid++}`;
                importMap.set(id, name);
                return name;
            },
            sourcemap: true
        })
        .then(({ code, map }) => {
            store.bundle = {
                code,
                map,
                imports: bundle.imports,
                importMap
            };

            store.bundleError = null;
            store.runtimeError = null;

            render(output)(codeMirror);
        });
    })
    .catch(err => {
        console.error(err.stack);

        store.bundleError = err;
    });

    window.bundlePromise.cancel = () => {
        cancelled = true;
    };
}
