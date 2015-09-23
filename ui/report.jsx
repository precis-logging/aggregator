var {
  HBarChart,
  VBarChart,
  LineChart,
  PieChart,
  ScatterChart,
  TimeSeries2Chart,
  TimeSeriesChart
} = D3RRC;

var {
  noop,
  clone
} = Support;

var {
  addCommas,
  isNumeric
} = Support;

var AggregateStatsTable = React.createClass({
  getInitialState(){
    return {
      count: true
    };
  },
  showHideStat(stat, show){
    var update = {};
    update[stat] = show;
    this.setState(update);
  },
  render(){
    var stats = Object.keys(this.state);
    var head = <tr><th>Date</th>{stats.map((name,index)=><th key={index}>{name}</th>)}</tr>;
    var body = [];
    if(this.props.data && this.props.data.length){
      body = this.props.data.reverse().map((item, index)=>{
        var cells = [<td key="date">{item.time.toLocaleString()}</td>].concat(stats.map((name, index)=>{
          return <td key={index}>{addCommas(item.stats[name]||0)}</td>
        }));
        return <tr key={index}>{cells}</tr>;
      });
    }
    return (
      <div>
        <StatsCheckList stats={this.props.stats} checked={this.state} statChanged={this.showHideStat} />
        <table className="table table-striped table-condensed">
          <thead>
            {head}
          </thead>
          <tbody>
            {body}
          </tbody>
        </table>
      </div>
    );
  }
});

var AggregatePieChart = React.createClass({
  getInitialState(){
    return {
      count: true
    };
  },
  showHideStat(stat, show){
    var update = {};
    update[stat] = show;
    this.setState(update);
  },
  render(){
    var data = [
      {
        value: 50,
        text: 'first 50'
      },
      {
        value: 50,
        text: 'second 50'
      },
    ];
    var colorRange = d3.scale.category20();
    var colorLookup = function(v, d, i){
      return colorRange(i);
    };
    var chart = 'No data';
    if(this.props.data && this.props.data.length){
      var data = Object.keys(this.state||{}).filter((key)=>this.state[key]).map((key)=>{
        var name = key;
        return {
          text: name,
          value: this.props.data.reduce((curr, item)=>{
            var value = item.stats[key];
            return curr + (value||0);
          }, 0)
        };
      });
      var total = data.reduce(function(curr, item){
        return curr+item.value;
      }, 0);
      var sliceText = function(d){
        return d.data.text+' '+addCommas(d.data.value);
      };
      if(total){
        chart = <PieChart
          chart-height="320"
          chart-innerRadius="0"
          chart-colorRange={colorLookup}
          chart-sliceText={sliceText}
          data={data}
          />;
      }
    }
    return (
      <div>
        <StatsCheckList stats={this.props.stats} checked={this.state} statChanged={this.showHideStat} />
        {chart}
      </div>
    );
  }
});

var AggregateLineChart = React.createClass({
  getInitialState(){
    return {
      count: true
    };
  },
  showHideStat(stat, show){
    var update = {};
    update[stat] = show;
    this.setState(update);
  },
  render(){
    var data = [];
    var chart = 'No data';
    if(this.props.data && this.props.data.length){
      data = Object.keys(this.state||{}).filter((key)=>this.state[key]).map((key)=>{
        var name = key;
        return {
          name: name,
          values: this.props.data.map((item)=>{
            var index = new Date(item.time);
            var value = item.stats[key];
            return {
              name: name,
              index: index,
              value: value
            };
          })
        };
      });
      if(data.length){
        var seriesNames = function(d){
          return d.name;
        };
        var seriesValues = function(d){
          return d.values;
        };
        var pointNames = function(d){
          return d.name;
        };
        var pointValues = function(d, i){
          return d.value;
        };
        var pointIndexes = function(d, i){
          return d.index;
        };
        var pointHints = function(d){
          return d.index.toLocaleString() + ' - ' + addCommas(d.value);
        };
        var style = {
          '.axis path': 'fill: none; stroke: #000; shape-rendering: crispEdges;',
          '.axis line': 'fill: none; stroke: #000; shape-rendering: crispEdges;',
          '.x.axis path': 'display: none;',
          '.line': 'fill: none; stroke-width: 1.5px;',
        };
        chart = <LineChart
                  data={data}
                  chart-seriesNames={seriesNames}
                  chart-seriesValues={seriesValues}
                  chart-pointNames={pointNames}
                  chart-pointValues={pointValues}
                  chart-pointIndexes={pointIndexes}
                  chart-pointText={pointHints}
                  chart-style={style}
                  />;
      }
    }

    return(
      <div>
        <StatsCheckList stats={this.props.stats} checked={this.state} statChanged={this.showHideStat} />
        {chart}
      </div>
    );
  }
});

var StatsCheckList = React.createClass({
  getInitialState(){
    return this.props.checked || {};
  },
  statChange(e){
    var updates = {};
    var field = e.target.value;
    var checked = e.target.checked;
    updates[field] = checked;
    if(this.props.statChanged){
      this.props.statChanged(field, checked);
    }
    this.setState(updates);
  },
  render(){
    var stats = Object.keys(this.props.stats||{}).map((stat)=>{
      return <label key={"stat_"+stat}><input type="checkbox" name="stats" id={"stat_"+stat} checked={this.state[stat]} value={stat} onChange={this.statChange} /> {stat} &nbsp;</label>
    });
    return (
      <div>
        {stats}
      </div>
    );
  }
});

var BaseReportPage = React.createClass({
  getInitialState(){
    return {
      aggregators: [],
      stats: [],
      samples: [],
    };
  },
  updateState(Aggregators){
    var aggregators = Aggregators.items();
    this.setState({
      aggregators: aggregators,
    });
  },
  applyChanges(e){
    e.preventDefault();
    this.loadStats();
  },
  componentDidMount(){
    DataStore.getStore('Aggregators', function(err, Aggregators){
      if(err){
        return console.error(err);
      }
      this.unlisten = Aggregators.listen(()=>this.updateState(Aggregators));
      this.updateState(Aggregators);
    }.bind(this));
  },
  loadAllData(baseUrl){
    var records = [], stats = {};
    var getBlock = function(offset){
      Loader.get(baseUrl+'&offset='+offset, function(err, raw){
        if(err){
          console.error(err);
        }
        var aggregates = raw.items||[];
        if(aggregates[0] && aggregates[0].stats){
          var count = raw.length;
          var loaded = raw.offset+raw.count;
          aggregates.forEach((agg)=>{
            Object.keys(agg.stats).forEach((name)=>{
              stats[name] = true;
            });
          });
          records = records.concat(aggregates.map((item)=>{var c = clone(item); c.time = new Date(c.time); return c;}));
          if(loaded < count){
            return setTimeout(()=>{
              getBlock(loaded);
            }, 1);
          }
        }
        this.setState({stats: stats||{}, samples: records});
      }.bind(this));
    }.bind(this);
    getBlock(0);
  },
  loadStats(){
    var value = this.refs.aggregator.getDOMNode().value;
    if(!value){
      return this.setState({
        stats: [],
        samples: [],
      });
    }
    var url = '/api/v1/aggregates?&sort[time]=-1&filter[name]='+encodeURIComponent(value);
    var start = Date.parse(this.refs.startDate.getDOMNode().value);
    var end = Date.parse(this.refs.endDate.getDOMNode().value);
    if(!isNaN(start)){
      start = new Date(start);
      url += '&filter[date][$gte]='+start.toISOString();
    }
    if(!isNaN(end)){
      end = new Date(end);
      end.setDate(end.getDate()+1);
      url += '&filter[date][$lte]='+end.toISOString();
    }
    this.loadAllData(url);
  },
  aggregatorChange(e){
    e.preventDefault();
    return this.setState({
      stats: [],
      samples: [],
    });
  },
  componentWillUnmount(){
    this.unlisten&&this.unlisten();
  },
  formSubmit(e){
    e.preventDefault();
  },
  render(){
    var aggregators = this.state.aggregators.map((agg)=>{
      var state = agg.deleted?' (deleted)':agg.disabled?' (disabled)':'';
      return <option key={agg.key} value={agg.name}>{agg.name}{state}</option>
    });
    var samples = (this.state.samples || []).sort((a, b)=>a.time.getTime()-b.time.getTime());
    var data = samples;
    var endDate = new Date();
    //endDate.setDate(endDate.getDate()-1);
    var startDate = new Date(endDate);
    return(
      <div>
        <h1>Report</h1>
        <form onSubmit={this.formSubmit}>
          <label htmlFor="aggregate">Aggregate:</label>
          <select id="aggregate" className="form-control" ref="aggregator" onChange={this.aggregatorChange}>
            {aggregators}
          </select>
          <label htmlFor="startDate">Start Date:</label>
          <input id="startDate" ref="startDate" className="form-control" type="date" defaultValue={startDate.toISOString().substr(0, 10)} />
          <label htmlFor="endDate">End Date:</label>
          <input id="endDate" ref="endDate" className="form-control" type="date" defaultValue={endDate.toISOString().substr(0, 10)} />
          <button className="btn btn-primary" onClick={this.applyChanges}>View</button>
        </form>
        <div ref="views">
          <AggregateLineChart
            data={data}
            stats={this.state.stats}
            />
          <AggregatePieChart
            data={data}
            stats={this.state.stats}
            />
          <AggregateStatsTable
            data={data}
            stats={this.state.stats}
            />
        </div>
      </div>
    );
  }
});

var ViewPage = React.createClass({
  applyChanges(e){
    e.preventDefault();
  },
  render(){
    var name = this.props.params.name;
    return(
      <div>
        <h1>Report {name}</h1>
        <form onSubmit={this.formSubmit}>
          <label htmlFor="startDate">Start Date:</label>
          <input id="startDate" ref="startDate" className="form-control" type="date" />
          <label htmlFor="endDate">End Date:</label>
          <input id="endDate" ref="endDate" className="form-control" type="date" />
          <button className="btn btn-primary" onClick={this.applyChanges}>Apply</button>
        </form>
      </div>
    );
  }
});

var EditPage = React.createClass({
  getInitialState(){
    return {
      aggregators: [],
      stats: [],
      samples: [],
    };
  },
  updateState(Aggregators){
    var aggregators = Aggregators.items();
    this.setState({
      aggregators: aggregators,
    });
    //this.loadStats();
  },
  componentDidMount(){
    DataStore.getStore('Aggregators', function(err, Aggregators){
      if(err){
        alert(err);
        return console.error(err);
      }
      this.unlisten = Aggregators.listen(()=>this.updateState(Aggregators));
      this.updateState(Aggregators);
    }.bind(this));
  },
  loadStats(){
    var value = this.refs.aggregator.getDOMNode().value;
    if(!value){
      return this.setState({
        stats: [],
        samples: [],
      });
    }
    var url = '/api/v1/aggregates?&sort[time]=-1&filter[name]='+encodeURIComponent(value);
    var start = Date.parse(this.refs.startDate.getDOMNode().value);
    var end = Date.parse(this.refs.endDate.getDOMNode().value);
    if(!isNaN(start)){
      start = new Date(start);
      url += '&filter[date][$gte]='+start.toISOString();
    }
    if(!isNaN(end)){
      end = new Date(end);
      url += '&filter[date][$lte]='+end.toISOString();
    }
    return Loader.get(url, function(err, raw){
      if(err){
        console.error(err);
        return alert(err.toString());
      }
      var aggregates = raw.items||[];
      if(aggregates[0] && aggregates[0].stats){
        return this.setState({stats: aggregates[0].stats, samples: aggregates});
      }
      this.setState({stats: [], samples: []});
    }.bind(this));
  },
  applyChanges(e){
    e.preventDefault();
    this.loadStats();
  },
  aggregatorChange(e){
    e.preventDefault();
    this.loadStats();
  },
  componentWillUnmount(){
    this.unlisten&&this.unlisten();
  },
  formSubmit(e){
    e.preventDefault();
  },
  render(){
    var aggregators = this.state.aggregators.map((agg)=>{
      var state = agg.deleted?' (deleted)':agg.disabled?' (disabled)':'';
      return <option key={agg.key} value={agg.name}>{agg.name}{state}</option>
    });
    var stats = Object.keys(this.state.stats).map((stat)=>{
      return <label key={"stat_"+stat} htmlFor={"stat_"+stat}><input type="checkbox" name="stats" id={"stat_"+stat} value={stat} />{stat}</label>
    });
    return(
      <div>
        <h1>Report</h1>
        <form onSubmit={this.formSubmit}>
          <label htmlFor="aggregate">Aggregate:</label>
          <select id="aggregate" className="form-control" ref="aggregator" onChange={this.aggregatorChange}>
            {aggregators}
          </select>
          <div>
            <label htmlFor="stats">Stats:</label>
            {stats}
          </div>
          <label htmlFor="startDate">Start Date:</label>
          <input id="startDate" ref="startDate" className="form-control" type="date" />
          <label htmlFor="endDate">End Date:</label>
          <input id="endDate" ref="endDate" className="form-control" type="date" />
          <button className="btn btn-primary" onClick={this.applyChanges}>Refresh Samples</button>
        </form>
      </div>
    );
  }
});

Pages.register('RunReport', ViewPage);
Pages.register('EditReport', EditPage);
Pages.register('CreateReport', EditPage);
Pages.register('BaseReportPage', BaseReportPage);
