
const buttonText = fm.atom('Hello World!');

const root = fm.createRoot(document.getElementById('root'));
root.render(
    fm.component(() => {
        fm.onMount(() => {
            console.log('My component is mounting.');
        });

        fm.onUnmount(() => {
            console.log('My component is unmounting.');
        });

        const onClick = (e) => {
            console.log('Hello World!');
            buttonText.update('button clicked');
        };

        const buttonText2 = fm.useAtom((a) => a + ' Some Extra Text.', [buttonText]);

        return (
            fm.createElement('div', {id: 'element-A'}, [
                fm.createElement('button', {id: buttonText2, onClick}, [
                    fm.createText(buttonText2),
                    fm.createElement('br', null, null),
                    fm.createText('another line of text')
                ])
            ])
        );
    })
);

setTimeout(function(){
    root.render(fm.createElement('div', {id: 'element-B'}, [
        fm.createText('New Div Element!')
    ]));
}, 3500);

