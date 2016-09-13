var noop = function(){};

var getStatName = function(key, stat){
  if(!stat.name){
    return key.replace(/[^a-z0-9]+/gi, ' ').toLowerCase()
        .replace(/\s(.)/g, function($1) { return $1.toUpperCase(); })
        .replace(/\s/g, '')
        .replace(/^(.)/, function($1) { return $1.toLowerCase(); });
  }
  return stat.name;
};

var Aggregator = React.createClass({
  getInitialState(){
    var info = this.props.info || {};
    return{
      info: info,
      editing: false,
      customName: (!!info.name)&&(info.name !== getStatName(info.key||'', info))
    }
  },
  updateRecord(updates, callback){
    var record = {};
    var info = this.state.info;
    Object.keys(info).forEach((key)=>{
      record[key] = info[key];
    });
    Object.keys(updates).forEach((key)=>{
      record[key] = updates[key];
    });
    if(record._id){
      return Loader.post('/api/v1/aggregator/'+record._id, {data: record}, function(err){
        return callback(err);
      });
    }
    return Loader.post('/api/v1/aggregator', {data: record}, function(err){
      this.onCancelClick();
      return callback(err);
    }.bind(this));
  },
  saveChanges(callback){
    var rules = this.refs.rules.getDOMNode().value;
    var info = {};
    info.key = this.refs.key.getDOMNode().value;
    info.name = this.refs.name.getDOMNode().value;
    if(!info.key){
      return (callback||noop)(new Error('Key is required'));
    }
    if(!info.name){
      return (callback||noop)(new Error('Name is required'));
    }
    try{
      rules = JSON.parse(rules);
    }catch(e){
      try{
        var f = new Function('', 'return '+rules);
        rules = f();
      }catch(e2){
        return (callback||noop)(e2);
      }
      //return (callback||noop)(e);
    }
    info.rule = rules;
    this.updateRecord(info, callback);
  },
  onEditClick(e){
    if(e){
      e.preventDefault();
    }
    this.setState({
      editing: true
    });
  },
  onCancelClick(e){
    if(e){
      e.preventDefault();
    }
    this.refs.form.getDOMNode().reset();
    this.setState({
      error: false,
      editing: false
    });
  },
  onApply(e){
    e.preventDefault();
    this.saveChanges(function(err){
      if(err){
        return this.setState({
          error: err.toString()
        });
      }
    }.bind(this));
  },
  onSubmit(e){
    e.preventDefault();
    this.saveChanges(function(err){
      if(err){
        return this.setState({
          error: err.toString()
        });
      }
      this.setState({
        error: false,
        editing: false
      });
    }.bind(this));
  },
  nameChanged(e){
    this.setState({
      customName: true
    })
  },
  keyChanged(e){
    var val = e.target.value;
    if(!this.state.customName){
      var info = this.state.info;
      info.name = '';
      this.refs.name.getDOMNode().value = getStatName(val||'', info);
    }
  },
  onDelete(e){
    e.preventDefault();
    var info = {
      deleted: true
    };
    return this.updateRecord(info);
  },
  onUnDelete(e){
    e.preventDefault();
    var info = {
      deleted: false
    };
    return this.updateRecord(info);
  },
  onEnable(e){
    e.preventDefault();
    var info = {
      disabled: false
    };
    return this.updateRecord(info);
  },
  onDisable(e){
    e.preventDefault();
    var info = {
      disabled: true
    };
    return this.updateRecord(info);
  },
  componentWillReceiveProps(props){
    if(props.info){
      this.setState({
        info: props.info
      });
    }
  },
  render(){
    var error = this.state.error?<div className="bs-callout bs-callout-danger">
      {this.state.error.replace(/^Error:/, 'ERROR:')}
    </div>:'';
    var info = this.state.info;
    var mode = this.props.mode || 'edit';
    var editButton;
    var deleted = !!info.deleted;
    var disabled = !!info.disabled;
    var status = deleted?<span> - <span className="text-danger"> Deleted</span></span>
                   :(disabled?<span> - <span className="text-warning"> Disabled</span></span>:'');
    var actions = [];
    switch(mode){
      case('new'):
        editButton = <button className="btn btn-primary" style={{display: this.state.editing?'none':''}} onClick={this.onEditClick}>New</button>;
        actions = [
              <button key="save" className="btn btn-primary">Create</button>,
              <button key="cancel" className="btn btn-warning" onClick={this.onCancelClick}>Cancel</button>,
            ];
        break;
      default:
        editButton = <button className="btn btn-default" style={{display: this.state.editing?'none':''}} onClick={this.onEditClick}>Edit</button>;
        actions = [
              <button key="apply" className="btn btn-default" onClick={this.onApply}>Apply</button>,
              <button key="save" className="btn btn-primary">Save</button>,
              <button key="cancel" className="btn btn-warning" onClick={this.onCancelClick}>Cancel</button>,
            ];
    }
    if(info && info._id){
      if(disabled){
        if(!deleted){
          actions.push(<button key="undelete" className="btn btn-success" onClick={this.onEnable}>Enable</button>);
        }
        actions.push(!deleted?<button key="delete" className="btn btn-danger" onClick={this.onDelete}>Delete</button>:
                              <button key="undelete" className="btn btn-danger" onClick={this.onUnDelete}>Restore</button>);
      }
      if(!disabled){
        actions.push(<button key="undelete" className="btn btn-danger" onClick={this.onDisable}>Disable</button>);
      }
    }
    return (
      <div>
        <h2>{editButton}{info.key}{status}</h2>
        <form ref="form" style={{display: this.state.editing?'':'none'}} onSubmit={this.onSubmit}>
          <div className="bs-callout bs-callout-info">
            {error}
            <div className="form-group">
              <label>Key:</label>
              <input ref="key" type="text" className="form-control" name="key" defaultValue={info.key} onChange={this.keyChanged} />
            </div>
            <div className="form-group">
              <label>Name:</label>
              <input ref="name" type="text" className="form-control" name="name" defaultValue={getStatName(info.key||'', info)} onChange={this.nameChanged} />
            </div>
            <div className="form-group">
              <label>Rules:</label>
              <textarea ref="rules" className="form-control" rows="10" defaultValue={JSON.stringify(info.rule, null, '  ')} />
            </div>
            {error}
            {actions}
          </div>
        </form>
      </div>
    );
  }
});

var Page = React.createClass({
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
    var aggregators = this.state.aggregators.map(function(info, index){
      return <Aggregator key={index} info={info} />;
    });
    return(
      <div>
        <h1>Aggregators</h1>
        <Aggregator mode="new" />
        {aggregators}
      </div>
    )
  }
});

Pages.register('Aggregators', Page);
