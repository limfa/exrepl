## intro

简便的 repl

无依赖

功能：

0. 历史记录
   默认保存 100 条记录在用户目录下的`.node_repl`对于每一个执行文件
1. promise 结果直接导出

正常的 repl

```js
> fs.promises.readFile('readme.md', 'utf-8')
Promise {
  <pending>,
```

exrepl

```js
> fs.promises.readFile('readme.md', 'utf-8')
'## intro\r\n\r\n简便的 repl\r\n\r\n无依赖\r\n\r\n功能：\r\
```

## todo

0. 支持 promise 函数链式调用
1. 测试用例

## usage

`require('../')()`