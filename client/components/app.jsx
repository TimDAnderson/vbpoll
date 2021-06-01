import React from 'react';
import { BrowserRouter as Router, Route, Switch, withRouter } from 'react-router-dom';
import moment from 'moment';
import PollSetup from './pollSetup';
import Vote from './vote';
import sharedFunctions from '../sharedFunctions';

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      user: '',
      modalOpen: false,
      userHasVoted: false,
      userVotedFor: '',
      pollID: '',
      subId: '',
      updating: false,
      newPoll: true,
      previouslySaved: {
        allowUnlimitedVotes: '1',
        isOpen: true,
        question: '',
        a: '',
        b: '',
        c: '',
        openUntil: '2021-05-27T12:45',
        frequency: '1',
      },
      poll: {
        allowUnlimitedVotes: '0',
        isOpen: false,
        question: '',
        a: '',
        b: '',
        c: '',
        openAsOf: '',
        openUntil: '',
        frequency: '2',
      },
      errors: {
        question: '',
        a: '',
        b: '',
        c: '',
      },
    };
    this.inputFieldChange = this.inputFieldChange.bind(this);
    this.savePoll = this.savePoll.bind(this);
    this.getVoteStatus = this.getVoteStatus.bind(this);
    this.saveVote = this.saveVote.bind(this);
  }

  componentDidMount() {
    let { pollID } = this.props.match.params;
    const { search } = this.props.location;
    const subId = new URLSearchParams(search).get('subscription_id');
    this.setState({ subId });
    this.getCurrentPoll(subId, pollID);
    if (!this.state.pollID && pollID === 'edit') { this.regenerateId(); }
    this.getVoteStatus(pollID);
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const pollData = { ...this.state.poll }; // TODO: This should come from the database eventually
    pollData.openUntil = `${moment(nextWeek).format('YYYY-MM-DD')}T23:59`;
    this.setState({ poll: pollData });
  }

  async getCurrentPoll(subId, pollID) {
    let url;
    if (!subId) {
      url = `/polls/find/poll/${pollID}`;
    } else {
      url = `/polls/find/${subId}`;
    }
    fetch(url)
      .then((initial) => {
        if (initial.status !== 204) {
          this.setState({ subId });
        }
        return initial;
      })
      .then((response) => response.json())
      .then((poll) => {
        this.setState({
          newPoll: false,
          poll: poll.poll,
          previouslySaved: poll.poll,
          pollID: poll.pollID,
          subId,
        });
      })
      .catch((err) => console.error(err));
  }

  async getVoteStatus(pollID) {
    console.log(pollID);
    let ip;
    let userHasVoted;
    let userVotedFor;
    await fetch('https://api.ipify.org?format=json', { mode: 'cors' })
      .then((res) => res.json())
      .then((data) => {
        ip = data.ip;
        this.setState({ user: ip });
      });
    fetch(`/verify/${pollID}/${ip}`)
      .then((res) => res.json())
      .then((data) => {
        userHasVoted = data.voted;
        userVotedFor = data.votedForOption;
        this.setState({ userHasVoted, userVotedFor });
        if (this.state.poll.allowUnlimitedVotes === '0') {
          document.getElementsByClassName(`answer-${userVotedFor}`)[0].classList.add('chosen');
        }
      });
  }

  savePoll() {
    let { poll, pollID, subId } = this.state;
    let didError = false;
    ['question', 'a', 'b'].forEach((name) => {
      if (poll[name] === '') {
        didError = true;
        const { errors } = this.state;
        errors[name] = 'This field is required.';
        this.setState({ errors });
      } else {
        const { errors } = this.state;
        errors[name] = '';
        this.setState({ errors });
      }
    });
    if (didError) { return; }
    let metadata;
    if (poll.isOpen) {
      metadata = {};
    } else if (!poll.isOpen) {
      metadata = { ...sharedFunctions.pollTemplate };
      poll.isOpen = true;
      metadata.pollID = pollID;
      metadata.subId = subId;
    }
    console.log(poll);
    console.log('Saving poll information');
    fetch('/polls/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pollID, metadata, pollData: poll }),
    })
      .then(() => console.log('saved'))
      .then(() => {
        if (poll.frequency !== this.state.previouslySaved.frequency) {
          this.updatePollFrequency();
        }
      })
      .then(() => this.componentDidMount())
      .catch((err) => console.error(err));
  }

  updatePollFrequency() {
    const { subId, poll } = this.state;
    fetch('/polls/frequency/update', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subId, newFrequency: poll.frequency }),
    })
      .then(() => console.log('Updated frequency'));
  }

  regenerateId() {
    const pollID = sharedFunctions.generatePollId();
    this.setState({ pollID });
  }

  saveVote(option) {
    let { pollID, user } = this.state;
    fetch(`/vote/${pollID}/${user}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ option }),
    })
      .then((res) => {
        if (res.status === 201) {
          const allAnswerButtons = document.getElementsByClassName('answer');
          for (let button of allAnswerButtons) {
            button.classList.remove('chosen');
          }
          const votedForButton = document.getElementsByClassName(`answer-${option}`)[0];
          votedForButton.classList.add('chosen');
        }
      })
      .catch((err) => console.error(err));
  }

  inputFieldChange(val, inputName) {
    ['a', 'b', 'c'].forEach((name) => {
      if (inputName === name && val.length > 14) {
        const { errors } = this.state;
        errors[name] = 'Too many characters for this line!';
        this.setState({ errors });
      } else if (val.length <= 14) {
        const { errors } = this.state;
        errors[name] = '';
        this.setState({ errors });
      }
    });
    const newPollState = { ...this.state.poll };
    const previousPollSet = { ...this.state.previouslySaved };
    newPollState[inputName] = val;
    const updating = newPollState[inputName] !== previousPollSet[inputName];
    this.setState({ poll: { ...newPollState }, updating });
  }

  render() {
    const { poll } = this.state;
    return (
      <Router>
        <Switch>
          <Route exact path="/edit">
            <PollSetup actions={{ onChange: this.inputFieldChange, save: this.savePoll }} state={{ ...this.state }} />
          </Route>
          <Route path="/:id">
            <Vote actions={{ saveVote: this.saveVote }} poll={poll} />
          </Route>
        </Switch>
      </Router>
    );
  }
}

export default withRouter(App);
