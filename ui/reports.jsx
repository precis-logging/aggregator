var Link = ReactRouter.Link;
var Page = React.createClass({
  render(){
    return(
      <div>
        <h1>Reports</h1>
        <Link to="/report/base">Base Report</Link>
      </div>
    );
  }
});

Pages.register('Reports', Page);
