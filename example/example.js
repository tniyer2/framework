
const buttonText = fm.atom('Hello World!');
const buttonText2 = fm.atom((a) => a + ' Some Extra Text.', [buttonText]);

const doSomething = (e) => {
    console.log('Hello World!');
    buttonText.update('button clicked');
};

const root = fm.createRoot(document.getElementById('root'));
root.render(
    fm.createElement('div', {id: 'element-A'}, [
        fm.createElement('button', {id: buttonText2, onClick: doSomething}, [
            fm.createText(buttonText2),
            fm.createElement('br', null, null),
            fm.createText('another line of text')
        ])
    ])
);

setTimeout(function(){
    root.render(fm.createElement('div', {id: 'element-B'}, [
        fm.createText('New Div Element!')
    ]));
}, 3500);

