var queueStatus = (function(){
  var timer = false;
  return function(rec, depth){
    if(timer){
      return;
    }
    queueStatus.depth = depth;
    if(rec && rec.dateTime && (depth > 1000)){
      console.log(rec.dateTime, 'depth: ', depth);
      timer = setTimeout(function(){
        timer = false;
      }, 10000);
    }
  };
})();

module.exports = queueStatus;
