// eslint-disable-next-line @typescript-eslint/no-var-requires
const Handlebars = require('handlebars');

Handlebars.registerHelper('uppercase', function(str) {
  return str.toUpperCase();
});

Handlebars.registerHelper('greet', function(name) {
  return 'Hello from hbs1, ' + name;
});

Handlebars.registerHelper('mentions', function() {
  return [];
});

const template = Handlebars.compile(`
<ul>
{{#each (mentions)}}
    <li>{{@index}}: {{this}}</li>
{{else}}
    <li>No items found</li>
{{/each}}
</ul>
`);

console.log(template({}));
// 输出:
// <ul>
//     <li>0: apple</li>
//     <li>1: banana</li>
//     <li>2: orange</li>
// </ul>

console.log(template({ items: [] }));
// 输出:
// <ul>
//     <li>No items found</li>
// </ul>