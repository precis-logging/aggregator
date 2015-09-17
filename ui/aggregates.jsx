var ToggleRow = React.createClass({
  getInitialState(){
    return {
      hidden: true,
    };
  },
  toggleView(e){
    if(e){
      e.preventDefault();
    }
    this.setState({
      hidden: !this.state.hidden
    })
  },
  render(){
    var showHideText = this.state.hidden?'Show Details':'Hide Details';
    var styleDisplay = this.state.hidden?'none':'';
    var showHide = <a href="#" onClick={this.toggleView}>{showHideText}</a>
    return (
      <tr>
        <td colSpan={this.props.colSpan}>
          {showHide}
          {this.state.hidden?'':this.props.children}
        </td>
      </tr>
    );
  }
});

var AggregatesTable = React.createClass({
  toggleRow(e){
    e.preventDefault();
    console.log(e.target.parentNode.getAttribute('toggleRow'))
  },
  render(){
    var {
      aggregates
    } = this.props;
    if(!aggregates.length){
      return <span />;
    }
    var headers = [
      <th key="id">ID</th>,
      <th key="key">Key</th>,
      <th key="name">Name</th>,
      <th key="stats">Stats</th>,
      <th key="time">Time</th>,
      <th key="environment">Environment</th>,
    ];
    var records = [];
    var statsListing = ['min','max','count','sum', 'slow'];
    var inStatList = function(name){
      return statsListing.indexOf(name)>-1;
    };
    aggregates.forEach((item, index)=>{
      var stats = Object.keys(item.stats).filter(inStatList).map((name, index)=>{
        var value = item.stats[name];
        return <div key={index}>{name}: {value}</div>;
      });
      //var toggleRow = <ToggleRow contents={{__html: escapeHTML(JSON.stringify(item, null, '  ')).replace(/\n/g, '<br />')}} colSpan={5} key={index+'-details'} />;
      var toggleRow = (
        <ToggleRow colSpan={5} key={index+'-details'}>
          <JSONNode obj={item} />
        </ToggleRow>
      );
      records.push(
        <tr key={index}>
          <td>{item._id}</td>
          <td>{item.key}</td>
          <td>{item.name}</td>
          <td>{stats}</td>
          <td>{new Date(item.time).toLocaleString()}</td>
          <td>{item.environment}</td>
        </tr>
      );
      records.push(
        toggleRow
      );
    });
    return (
      <table className="table table-striped table-condensed">
        <thead>
          <tr>
            {headers}
          </tr>
        </thead>
        <tbody>
          {records}
        </tbody>
      </table>
    );
  }
});

var Pager = React.createClass({
  render(){
    var {
      offset,
      limit,
      count,
    } = this.props;
    if((!count) || (!limit) || (limit < 0) || (count < limit)){
      return <span />;
    }
    var pageCount = Math.ceil(count / limit);
    var currPage = Math.floor(offset / limit)+1;
    var i = 0;

    var items = [];
    items.push(<li key="previous" className={offset?'':'disabled'}>
                  <a href="#" aria-label="Previous" onClick={this.props.previous}>
                    <span aria-hidden="true">&laquo;</span>
                  </a>
                </li>);

    for(i=1; i<=pageCount; i++){
      items.push(<li key={i} className={currPage===i?'active':''}><a href="#" onClick={this.props.setPage} value={i-1}>{i}</a></li>);
    }

    items.push(<li key="next" className={(offset+limit < count)?'':'disabled'}>
                  <a href="#" aria-label="Next" onClick={this.props.next}>
                    <span aria-hidden="true">&raquo;</span>
                  </a>
                </li>);
    var ul = <ul className="pagination pagination-sm">{items}</ul>;
    return <nav>{ul}</nav>
  }
});

var CountsOverview = React.createClass({
  render(){
    var {
      offset,
      count,
      size,
    } = this.props;
    if(!size){
      return <span />;
    }
    return (
      <div className="well">
        Showing {offset} to {offset+size} of {count}
      </div>
    );
  }
});

var Page = React.createClass({
  getInitialState(){
    return {
      aggregators: [],
      aggregates: [],
      offset: 0,
      count: 0,
    };
  },
  updateState(Aggregators){
    var aggregators = Aggregators.items();
    this.setState({
      aggregators: aggregators,
    });
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
  componentWillUnmount(){
    this.unlisten&&this.unlisten();
  },
  applyChanges(e){
    if(e){
      e.preventDefault();
    }
    this.getAggregates(0);
  },
  getAggregates(offset){
    var value = this.refs.aggregator.getDOMNode().value;
    if(!value){
      return this.setState({
        aggregates: [],
        offset: 0,
        count: 0,
      });
    }
    var start = Date.parse(this.refs.startDate.getDOMNode().value);
    var end = Date.parse(this.refs.endDate.getDOMNode().value);
    var url = '/api/v1/aggregates?sort[time]=-1&filter[name]='+encodeURIComponent(value);
    url += '&offset='+(offset||0);
    if(!isNaN(start)){
      start = new Date(start);
      url += '&filter[date][$gte]='+start.toISOString();
    }
    if(!isNaN(end)){
      end = new Date(end);
      url += '&filter[date][$lte]='+end.toISOString();
    }
    if(value){
      return Loader.get(url, function(err, raw){
        if(err){
          console.error(err);
          return alert(err.toString());
        }
        var aggregates = raw.items;
        this.setState({aggregates, offset: raw.offset, count: raw.length, limit: raw.limit});
      }.bind(this));
    }
  },
  aggregatorChange(e){
    e.preventDefault();
    this.setState({
      offset: 0,
      limit: -1,
      count: 0,
    });
  },
  formSubmit(e){
    e.preventDefault();
  },
  previous(e){
    e.preventDefault();
    var v = this.state.offset-this.state.limit;
    this.getAggregates(v>=0?v:0);
  },
  next(e){
    e.preventDefault();
    var v = this.state.offset+this.state.limit;
    var max = this.state.count-1;
    this.getAggregates(v<=max?v:this.state.offset);
  },
  setPage(e){
    e.preventDefault();
    var pageNumber = e.target.getAttribute('value');
    var offset = pageNumber * this.state.limit;
    this.getAggregates(offset);
  },
  render(){
    var aggregators = this.state.aggregators.map((agg)=>{
      return <option key={agg.key} value={agg.name}>{agg.name}</option>
    });
    var aggregatesTable = <AggregatesTable aggregates={this.state.aggregates} />;
    var counts = <CountsOverview offset={this.state.offset} count={this.state.count} size={this.state.aggregates.length} />
    var pager = <Pager
                  next={this.next}
                  previous={this.previous}
                  setPage={this.setPage}
                  offset={this.state.offset}
                  limit={this.state.limit}
                  count={this.state.count}
                  />;

    var testObj = {
      key1: 'value 1',
      key2: 'value 2',
      sub: {
        key3: 'value 3'
      }
    };
    return(
      <div>
        <h1>Aggregates</h1>
        <form onSubmit={this.formSubmit}>
          <label htmlFor="aggregate">Aggregate:</label>
          <select id="aggregate" className="form-control" ref="aggregator" onChange={this.aggregatorChange}>
            {aggregators}
          </select>
          <label htmlFor="startDate">Start Date:</label>
          <input id="startDate" ref="startDate" className="form-control" type="date" />
          <label htmlFor="endDate">End Date:</label>
          <input id="endDate" ref="endDate" className="form-control" type="date" />
          <button className="btn btn-primary" onClick={this.applyChanges}>Apply</button>
          {counts}
          {pager}
          {aggregatesTable}
          {pager}
          {counts}
        </form>
      </div>
    )
  }
});

Pages.register('Aggregates', Page);
