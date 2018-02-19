// @ts-check

const store = {};

/** @type {HTMLTextAreaElement} */
const target = document.querySelector('#code-editor-mount');

/** @type {HTMLElement} */
const output = document.querySelector('#output');

const components = [
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
].map(component => {
    component.compiled = compile(component);

    return component;
});

/** @type {string} */
// Default content to render.
target.value = `<style>
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
    const componentNames = components.map(customComponent => '<' + customComponent.name);

    inner.list.unshift.apply(inner.list, componentNames);

    return inner;
};

/** @type {CodeMirror.Editor} */
const codeMirror = CodeMirror(mountReplace(target), codeMirrorConfig);

codeMirror.on('change', onChange(output));

render(output)(codeMirror);

updateBundle(components);

// /////////////////////////////////////////////////////////////////////////////////////////////////
// /////////////////////////////////////////////////////////////////////////////////////////////////
// /////////////////////////////////////////////////////////////////////////////////////////////////

function compile(component) {
    const warnings = [];

    if (component.type === 'js') {
        return {
            code: component.source,
            map: null,
            warnings
        };
    }

    const { code, map } = svelte.compile(component.source || '', {
        cascade: false,
        name: component.name,
        filename: component.name + '.html',
        onwarn: warning => {
            warnings.push(warning);
        }
    });

    return { code, map, warnings };
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
    if (!components || !components.length) return;
    if (components.some(c => !c.compiled)) return;

    // console.clear();
    console.log(`running Svelte compiler version %c${svelte.VERSION}`, 'font-weight: bold');

    if (window.bundlePromise) window.bundlePromise.cancel();

    const lookup = {};
    let warningCount = 0;

    components.forEach(component => {
        const w = component.compiled.warnings.length;

        warningCount += w;

        if (w > 0) {
            console.group(`${component.name}.${component.type}: ${w} ${w === 1 ? 'warning' : 'warnings'}`);

            component.compiled.warnings.forEach(warning => {
                console.warn(warning.message);
                console.log(warning.frame);
            });

            console.groupEnd();
        }

        const path = `./${component.name}.${component.type}`;

        if (path in lookup) {
            throw new TypeError(`Multiple ${component.name}.${component.type} components`);
        }

        lookup[path] = {
            code: component.compiled.code,
            map: component.compiled.map
        };
    });

    console.warn('warningCount', warningCount);

    let cancelled = false;

    let uid = 1;
    const importMap = new Map();

    // here we can move between different entry points
    const input = './MyComponent.svelte';

    window.bundlePromise = rollup.rollup({
        input,
        external: id => {
            return id[0] !== '.';
        },
        plugins: [{
            resolveId(importee, importer) {
                if (importee[0] === '.') return importee;
            },
            load(id) {
                if (id in lookup) return lookup[id];

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
