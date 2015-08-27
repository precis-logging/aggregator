var AggTable = React.createClass({
  render(){
    var recs = (this.props.records||[]);
    var len = recs.length;
    var records = recs.map((item, index)=>{
      var deleted = !!item.deleted;
      var disabled = !item.disabled;
      var status = deleted?'Deleted':(disabled?'Enabled':'Disabled');
      var classes = deleted?'danger':(disabled?'':'warning');
      return (
        <tr key={index} className={classes}>
          <td>{item._id}</td>
          <td>{item.key}</td>
          <td>{item.name}</td>
          <td>{status}</td>
        </tr>
      );
    });
    return (
      <div className="table-responsive">
        <table className="table table-striped table-condensed">
          <thead>
            <tr>
              <th>ID</th>
              <th>Key</th>
              <th>Name</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {records}
          </tbody>
        </table>
      </div>
    );
  }
});

var Section = React.createClass({
  displayName: 'Aggregators Section',
  getInitialState(){
    return {
      aggregators: []
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
  render(){
    return (
      <div>
        <h2 className="sub-header">Aggregators</h2>
        <AggTable records={this.state.aggregators} />
      </div>
    );
  }
});

Actions.register(Section, {role: 'dashboard-section'});
