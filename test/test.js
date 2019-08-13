require('../')({init({global})
  // this function can be used in global
  global.func1 = ()=>console.log('func1')
})
